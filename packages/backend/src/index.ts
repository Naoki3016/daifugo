import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { Room, GameState, Player, Card, Suit, Rank } from '@daifugo/common';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // 本番環境では適切なオリジンに制限する
    methods: ["GET", "POST"]
  }
});

// ルーム管理用のマップ
const rooms: Map<string, Room> = new Map();

// 全てのカードを生成する関数
function createDeck(): Card[] {
  const suits: Suit[] = ['spade', 'heart', 'diamond', 'club'];
  const ranks: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]; // A=1, J=11, Q=12, K=13
  const deck: Card[] = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }
  // ジョーカーを追加
  deck.push({ suit: 'joker', rank: 0, isJoker: true }); // ジョーカーのランクは0とする
  deck.push({ suit: 'joker', rank: 0, isJoker: true }); // ジョーカーは2枚

  return deck;
}

// カードをシャッフルする関数 (Fisher-Yates shuffle)
function shuffleDeck(deck: Card[]): Card[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// カードを配布する関数
function dealCards(players: Player[], deck: Card[]): void {
  let cardIndex = 0;
  while (cardIndex < deck.length) {
    for (const player of players) {
      if (cardIndex < deck.length) {
        player.hand.push(deck[cardIndex]);
        cardIndex++;
      } else {
        break;
      }
    }
  }
  // 手札をソート (オプション)
  for (const player of players) {
    player.hand.sort((a, b) => {
      if (a.suit === 'joker' && !b.isJoker) return 1; // ジョーカーは最後
      if (!a.isJoker && b.suit === 'joker') return -1;
      if (a.suit === b.suit) {
        return a.rank - b.rank;
      }
      return a.suit.localeCompare(b.suit); // スートでソート
    });
  }
}

// カードの強さを比較するヘルパー関数
// 革命中は強さが逆転する
function getCardStrength(card: Card, isRevolution: boolean): number {
  if (card.isJoker) return isRevolution ? -1 : 14; // ジョーカーは最強（革命中は最弱）
  let strength = card.rank;
  if (strength === 1) strength = 14; // Aは14として扱う
  if (strength === 2) strength = 15; // 2は15として扱う
  return isRevolution ? 15 - strength : strength;
}

// プレイヤーが出したカードが有効かどうかを判定する関数
function isValidPlay(gameState: GameState, playerId: string, playedCards: Card[]): { valid: boolean, message?: string } {
  const currentPlayer = gameState.players.find(p => p.id === playerId);
  if (!currentPlayer) {
    return { valid: false, message: 'プレイヤーが見つかりません。' };
  }

  // 1. ターンチェック
  if (gameState.currentPlayerId !== playerId) {
    return { valid: false, message: 'あなたのターンではありません。' };
  }

  // 2. 手札の確認
  for (const card of playedCards) {
    if (!currentPlayer.hand.some(c => c.suit === card.suit && c.rank === card.rank)) {
      return { valid: false, message: '手札にないカードが含まれています。' };
    }
  }

  // 3. 枚数チェック
  const numPlayed = playedCards.length;
  if (numPlayed === 0) {
    return { valid: false, message: 'カードを1枚以上出してください。' };
  }

  // ジョーカー単独出しの特例
  if (numPlayed === 1 && playedCards[0].isJoker) {
    return { valid: true }; // ジョーカー単独出しは常に有効
  }

  // 複数枚出しの場合、同じ数字であること
  if (numPlayed > 1 && !playedCards.every(c => c.rank === playedCards[0].rank)) {
    // 階段のチェック
    if (numPlayed >= 3) { // 3枚以上で階段の可能性
      const sortedCards = [...playedCards].sort((a, b) => a.rank - b.rank);
      const isSequence = sortedCards.every((card, index, arr) => {
        if (index === 0) return true;
        return card.rank === arr[index - 1].rank + 1;
      });
      const isSameSuit = sortedCards.every(card => card.suit === sortedCards[0].suit);

      if (isSequence && isSameSuit) {
        // 階段として有効
        // TODO: 場にカードがある場合の階段の強さチェック
        // 現時点では、場にカードがない場合の階段のみを考慮
        if (numLastPlayed === 0) {
          return { valid: true }; // 場にカードがない場合は階段として有効
        } else {
          // 場にカードがある場合の階段の強さチェックは複雑なので後回し
          return { valid: false, message: '場にカードがある場合の階段はまだ実装されていません。' };
        }
      }
    }
    return { valid: false, message: '複数枚出しの場合、同じ数字のカードのみ出せます。（階段は別途判定）' };
  }

  const lastPlayed = gameState.lastPlayedCards;
  const numLastPlayed = lastPlayed.length;

  if (numLastPlayed > 0) { // 場にカードがある場合
    // 枚数が同じであること
    if (numPlayed !== numLastPlayed) {
      return { valid: false, message: `場と同じ枚数（${numLastPlayed}枚）のカードを出してください。` };
    }

    // 4. 数字の強さチェック
    let lastCardStrength = getCardStrength(lastPlayed[0], gameState.currentRule.isRevolution);
    let playedCardStrength = getCardStrength(playedCards[0], gameState.currentRule.isRevolution);

    // 11バックが適用されている場合、一時的に強さを逆転
    if (gameState.currentRule.isElevenBack) {
      // 11バック中は、出したカードが場より弱い場合に有効
      if (playedCardStrength >= lastCardStrength) {
        return { valid: false, message: '11バック中です。場に出ているカードより弱いカードを出してください。' };
      }
    } else {
      // 通常時
      if (playedCardStrength <= lastCardStrength) {
        return { valid: false, message: '場に出ているカードより強いカードを出してください。' };
      }
    }

    // 5. 縛りチェック (記号縛り、数字縛り、両縛り)
    const lastPlayedCard = lastPlayed[0]; // 縛り判定は最初のカードで行う

    // 記号縛り
    if (gameState.currentRule.suitBind && playedCards[0].suit !== gameState.currentRule.suitBind) {
      return { valid: false, message: `記号縛り中です。${gameState.currentRule.suitBind}のカードを出してください。` };
    }
    // 数字縛り
    if (gameState.currentRule.rankBind && playedCards[0].rank !== gameState.currentRule.rankBind) {
      return { valid: false, message: `数字縛り中です。${gameState.currentRule.rankBind}のカードを出してください。` };
    }

    // 両縛り (記号縛りと数字縛りが同時に適用されている場合)
    if (gameState.currentRule.suitBind && gameState.currentRule.rankBind) {
      if (playedCards[0].suit !== gameState.currentRule.suitBind || playedCards[0].rank !== gameState.currentRule.rankBind) {
        return { valid: false, message: `両縛り中です。${gameState.currentRule.suitBind}の${gameState.currentRule.rankBind}のカードのみ出せます。` };
      }
    }

    // 新たな縛りの発生判定
    // 同じスートのカードが4枚以上連続して出された場合、記号縛りが発生
    if (numPlayed >= 4 && playedCards.every(c => c.suit === playedCards[0].suit)) {
      gameState.currentRule.suitBind = playedCards[0].suit;
    }
    // 同じ数字のカードが4枚以上連続して出された場合、数字縛りが発生
    if (numPlayed >= 4 && playedCards.every(c => c.rank === playedCards[0].rank)) {
      gameState.currentRule.rankBind = playedCards[0].rank;
    }
    // 両縛りが発生した場合
    if (gameState.currentRule.suitBind && gameState.currentRule.rankBind) {
      // 両縛りが発生したら、次のターンで解除されるまで継続
    }
  }

  // 革命の判定
  if (numPlayed >= 4 && playedCards.every(c => c.rank === playedCards[0].rank)) {
    // 革命が発生した場合、カードの強さが逆転する
    // 革命返しの場合、強さが元に戻る
    gameState.currentRule.isRevolution = !gameState.currentRule.isRevolution;
    // TODO: クライアントに革命発生を通知
  }

  // TODO: その他の特殊ルール（8切り、7渡し、10捨て、11バック、ジョーカー、スペ3返し、都落ち、カード交換）のバリデーションをここに追加

  return { valid: true };
}

io.on('connection', (socket: Socket) => {
  console.log(`User connected: ${socket.id}`);

  // ルーム作成イベント
  socket.on('createRoom', (data: { maxPlayers: number, rules: any }) => {
    const roomId = `room-${Math.random().toString(36).substring(2, 9)}`; // ユニークなルームIDを生成
    const newRoom: Room = {
      id: roomId,
      settings: {
        maxPlayers: data.maxPlayers,
        ...data.rules
      },
      players: [],
      gameState: null
    };
    rooms.set(roomId, newRoom);
    socket.join(roomId);
    const player: Player = { id: socket.id, name: `Player-${socket.id.substring(0, 4)}`, hand: [], rank: null, hasPassed: false, isRich: false, isPoor: false };
    newRoom.players.push(player);
    socket.emit('roomCreated', { roomId, room: newRoom });
    io.to(roomId).emit('playerJoined', { player, room: newRoom });
    console.log(`Room ${roomId} created by ${socket.id}`);
  });

  // ルーム参加イベント
  socket.on('joinRoom', (roomId: string) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    if (room.players.length >= room.settings.maxPlayers) {
      socket.emit('error', 'Room is full');
      return;
    }

    socket.join(roomId);
    const player: Player = { id: socket.id, name: `Player-${socket.id.substring(0, 4)}`, hand: [], rank: null, hasPassed: false, isRich: false, isPoor: false };
    room.players.push(player);
    socket.emit('roomJoined', { roomId, room });
    io.to(roomId).emit('playerJoined', { player, room });
    console.log(`User ${socket.id} joined room ${roomId}`);

    if (room.players.length === room.settings.maxPlayers) {
      startGame(room);
    }
  });

  // カードを出すイベント
  socket.on('playCards', (data: { roomId: string, cards: Card[] }) => {
    const room = rooms.get(data.roomId);
    if (!room || !room.gameState) {
      socket.emit('error', 'Game not in progress');
      return;
    }

    const validationResult = isValidPlay(room.gameState, socket.id, data.cards);
    if (!validationResult.valid) {
      socket.emit('error', validationResult.message || '無効な手です。');
      return;
    }

    // カードを場に出す
    room.gameState.field.push(...data.cards);
    room.gameState.lastPlayedCards = data.cards;

    // 手札から出したカードを削除
    const currentPlayer = room.gameState.players.find(p => p.id === socket.id);
    if (currentPlayer) {
      for (const playedCard of data.cards) {
        const index = currentPlayer.hand.findIndex(c => c.suit === playedCard.suit && c.rank === playedCard.rank);
        if (index !== -1) {
          currentPlayer.hand.splice(index, 1);
        }
      }
    }

    // あがり判定
    if (currentPlayer && currentPlayer.hand.length === 0) {
      // プレイヤーがあがった
      // 順位を確定させる
      room.gameState.finishedPlayers.push(currentPlayer);
      // TODO: クライアントにあがりを通知
      console.log(`Player ${currentPlayer.name} has finished!`);
      // ゲームから除外する（次のターン計算から外す）
      // room.gameState.players = room.gameState.players.filter(p => p.id !== currentPlayer.id);
    }

    // 次のターンへ移譲
    const currentPlayersInGame = room.gameState.players.filter(p => p.hand.length > 0); // まだ手札があるプレイヤー
    if (currentPlayersInGame.length > 0) {
      const currentIndex = currentPlayersInGame.findIndex(p => p.id === socket.id);
      const nextIndex = (currentIndex + 1) % currentPlayersInGame.length;
      room.gameState.currentPlayerId = currentPlayersInGame[nextIndex].id;
      // TODO: クライアントにターン変更を通知
    } else {
      // 全員があがった場合、ゲーム終了
      room.gameState.gamePhase = 'finished';
      // 最終順位の確定
      // 残っているプレイヤー（大貧民）を finishedPlayers に追加
      room.gameState.players.filter(p => p.hand.length > 0).forEach(p => room.gameState.finishedPlayers.push(p));

      // 順位付け
      const ranks = ['daifugo', 'fugo', 'heimin', 'hinmin', 'daihinmin'];
      for (let i = 0; i < room.gameState.finishedPlayers.length; i++) {
        const player = room.gameState.finishedPlayers[i];
        player.rank = ranks[i] as any; // 型アサーション

        // 都落ち判定
        if (player.rank === 'daihinmin' && player.isRich) { // 大富豪だったプレイヤーが大貧民になった場合
          player.isCapitalFall = true;
          console.log(`Player ${player.name} is now in Capital Fall state!`);
        } else {
          player.isCapitalFall = false; // 都落ちでなければリセット
        }

        // 次のゲームのためにisRichとisPoorをリセット
        player.isRich = false;
        player.isPoor = false;
      }

      // 今回のゲームの大富豪と大貧民を記録
      const daifugo = room.gameState.finishedPlayers.find(p => p.rank === 'daifugo');
      if (daifugo) daifugo.isRich = true;
      const daihinmin = room.gameState.finishedPlayers.find(p => p.rank === 'daihinmin');
      if (daihinmin) daihinmin.isPoor = true;

      // TODO: カード交換準備
      io.to(data.roomId).emit('gameEnd', { message: 'All players finished!', finishedPlayers: room.gameState.finishedPlayers });
    }

    // 8切りの判定と処理
    if (data.cards.some(card => card.rank === 8 && !card.isJoker)) { // ジョーカーでない8
      room.gameState.field = []; // 場を流す
      room.gameState.lastPlayedCards = []; // 最後のカードをリセット
      room.gameState.currentRule.suitBind = null; // 縛りを解除
      room.gameState.currentRule.rankBind = null; // 縛りを解除
      // TODO: クライアントに8切り発生を通知
    } else if (data.cards.some(card => card.rank === 10 && !card.isJoker)) { // ジョーカーでない10
      room.gameState.field = []; // 場を流す
      room.gameState.lastPlayedCards = []; // 最後のカードをリセット
      room.gameState.currentRule.suitBind = null; // 縛りを解除
      room.gameState.currentRule.rankBind = null; // 縛りを解除
      // 10捨ての場合、ターンは継続するため、currentPlayerIdは変更しない
      // TODO: クライアントに10捨て発生を通知
    }

    // 11バックの判定と処理
    if (data.cards.some(card => card.rank === 11 && !card.isJoker)) { // ジョーカーでない11
      room.gameState.currentRule.isElevenBack = !room.gameState.currentRule.isElevenBack; // 11バックのON/OFFを切り替える
      // TODO: クライアントに11バック発生を通知
    }

    // 7渡しの判定と処理
    const sevensPlayed = data.cards.filter(card => card.rank === 7 && !card.isJoker);
    if (sevensPlayed.length > 0) {
      // TODO: 次のプレイヤーにカードを渡すロジックを実装
      // 現時点では、次のプレイヤーにカードを渡す処理はスキップし、通知のみ
      // クライアント側で、どのカードを渡すか選択させるUIが必要
      // io.to(data.roomId).emit('sevenTransfer', { fromPlayerId: socket.id, numCards: sevensPlayed.length });
    }

    // スペ3返しの判定と処理
    if (gameState.currentRule.isRevolution && data.cards.length === 1 && data.cards[0].suit === 'spade' && data.cards[0].rank === 3) {
      room.gameState.field = []; // 場を流す
      room.gameState.lastPlayedCards = []; // 最後のカードをリセット
      room.gameState.currentRule.suitBind = null; // 縛りを解除
      room.gameState.currentRule.rankBind = null; // 縛りを解除
      // ターンは継続するため、currentPlayerIdは変更しない
      // TODO: クライアントにスペ3返し発生を通知
    }

    io.to(data.roomId).emit('gameUpdate', room.gameState);
  });

  // パスイベント
  socket.on('pass', (roomId: string) => {
    const room = rooms.get(roomId);
    if (!room || !room.gameState) {
      socket.emit('error', 'Game not in progress');
      return;
    }

    const currentPlayer = room.gameState.players.find(p => p.id === socket.id);
    if (!currentPlayer || room.gameState.currentPlayerId !== socket.id) {
      socket.emit('error', 'あなたのターンではありません、またはプレイヤーが見つかりません。');
      return;
    }

    currentPlayer.hasPassed = true;

    // 次のプレイヤーにターンを移譲
    const activePlayers = room.gameState.players.filter(p => p.hand.length > 0); // まだ手札があるプレイヤー
    let nextPlayerIndex = activePlayers.findIndex(p => p.id === socket.id);
    let nextPlayerFound = false;

    for (let i = 0; i < activePlayers.length; i++) {
      nextPlayerIndex = (nextPlayerIndex + 1) % activePlayers.length;
      const nextPlayer = activePlayers[nextPlayerIndex];
      if (!nextPlayer.hasPassed) {
        room.gameState.currentPlayerId = nextPlayer.id;
        nextPlayerFound = true;
        break;
      }
    }

    if (!nextPlayerFound) {
      // 全員がパスした場合、場を流す
      room.gameState.field = [];
      room.gameState.lastPlayedCards = [];
      room.gameState.currentRule.suitBind = null;
      room.gameState.currentRule.rankBind = null;

      // 全員がパスしたので、パス状態をリセットし、最初のプレイヤーにターンを戻す
      room.gameState.players.forEach(p => p.hasPassed = false);
      room.gameState.currentPlayerId = activePlayers[0].id; // 仮で最初のプレイヤーに戻す
      // TODO: クライアントに場が流れたことを通知
    }

    io.to(roomId).emit('gameUpdate', room.gameState);
  });

  // 切断イベント
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    rooms.forEach((room, roomId) => {
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        io.to(roomId).emit('playerLeft', { playerId: socket.id, room });
        if (room.players.length === 0) {
          rooms.delete(roomId);
          console.log(`Room ${roomId} deleted as all players left.`);
        }
      } else if (room.gameState && room.gameState.gamePhase === 'playing') {
        room.gameState.gamePhase = 'finished';
        io.to(roomId).emit('gameEnd', { message: 'Player left, game ended.' });
        rooms.delete(roomId);
      }
    });
  });

  // カード交換イベント
  socket.on('cardExchange', (data: { roomId: string, fromPlayerId: string, toPlayerId: string, cards: Card[] }) => {
    const room = rooms.get(data.roomId);
    if (!room || !room.gameState || room.gameState.gamePhase !== 'cardExchange') {
      socket.emit('error', 'カード交換フェーズではありません。');
      return;
    }

    // TODO: カード交換のバリデーションと処理
    // - fromPlayerId が正しいプレイヤーか
    // - toPlayerId が正しいプレイヤーか
    // - 渡すカードが手札にあるか
    // - 渡す枚数が正しいか（大富豪<=>大貧民は2枚、富豪<=>貧民は1枚）
    // - 都落ちの場合の処理

    // 例: カードを渡すプレイヤーの手札からカードを削除し、受け取るプレイヤーの手札に追加
    const fromPlayer = room.gameState.players.find(p => p.id === data.fromPlayerId);
    const toPlayer = room.gameState.players.find(p => p.id === data.toPlayerId);

    if (fromPlayer && toPlayer) {
      for (const cardToExchange of data.cards) {
        const index = fromPlayer.hand.findIndex(c => c.suit === cardToExchange.suit && c.rank === cardToExchange.rank);
        if (index !== -1) {
          fromPlayer.hand.splice(index, 1);
          toPlayer.hand.push(cardToExchange);
        }
      }
      // TODO: クライアントにカード交換の状況を通知
      io.to(data.roomId).emit('cardExchanged', { fromPlayerId: data.fromPlayerId, toPlayerId: data.toPlayerId, cards: data.cards });
    }

    // 全員がカード交換を終えたら、次のゲームを開始するトリガー
    // TODO: 全員がカード交換を終えたかどうかの状態管理
  });
});

// ゲーム開始ロジック
function startGame(room: Room) {
  console.log(`Starting game in room ${room.id}`);

  const deck = shuffleDeck(createDeck());
  dealCards(room.players, deck);

  room.gameState = {
    roomId: room.id,
    players: room.players.map(p => ({ ...p, hand: p.hand, rank: null, hasPassed: false, isRich: false, isPoor: false })), // 手札をセット
    currentPlayerId: room.players[0].id, // 仮で最初のプレイヤー
    field: [],
    lastPlayedCards: [],
    currentRule: {
      isRevolution: false,
      isEightCut: false,
      isSevenTransfer: false,
      isTenDiscard: false,
      isElevenBack: false,
      suitBind: null,
      rankBind: null,
    },
    gamePhase: 'playing',
    turnCount: 0
  };
  io.to(room.id).emit('gameStarted', room.gameState);
  io.to(room.id).emit('gameUpdate', room.gameState);
}

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});
