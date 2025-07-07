import { Suit, Rank, Card, Player, GameState, Room } from '@daifugo/common';
import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // 一時的にすべてのオリジンを許可
    methods: ["GET", "POST"],
    credentials: true // クッキーなどの資格情報を許可する場合
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
  deck.push({ suit: 'joker', rank: 0 as Rank, isJoker: true }); // ジョーカーのランクは0とする
  deck.push({ suit: 'joker', rank: 0 as Rank, isJoker: true }); // ジョーカーは2枚

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

const CARD_STRENGTH: { [key: number]: number } = {
  3: 1,
  4: 2,
  5: 3,
  6: 4,
  7: 5,
  8: 6,
  9: 7,
  10: 8,
  11: 9, // J
  12: 10, // Q
  13: 11, // K
  1: 12, // A
  2: 13, // 2
  0: 14, // Joker (rank 0 for joker)
};

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
      const strengthA = a.isJoker ? CARD_STRENGTH[0] : CARD_STRENGTH[a.rank];
      const strengthB = b.isJoker ? CARD_STRENGTH[0] : CARD_STRENGTH[b.rank];

      if (strengthA !== strengthB) {
        return strengthA - strengthB;
      }
      // 同じ強さの場合はスートでソート（任意）
      const suitOrder: { [key: string]: number } = { 'club': 1, 'diamond': 2, 'heart': 3, 'spade': 4, 'joker': 5 };
      return suitOrder[a.suit] - suitOrder[b.suit];
    });
  }
}

// カードの強さを比較するヘルパー関数
// 革命中は強さが逆転する
function getCardStrength(card: Card, isRevolution: boolean, isElevenBack: boolean): number {
  if (card.isJoker) return 100; // ジョーカーは常に最強

  let strength: number = card.rank;
  if (strength === 1) strength = 14; // Aは14として扱う
  if (strength === 2) strength = 15; // 2は15として扱う

  // 革命中または11バック中は強さが逆転
  if (isRevolution !== isElevenBack) { // 革命中で11バックでない、または11バックで革命中でない
    return 15 - strength; // 強さを反転
  } else {
    return strength; // 通常の強さ
  }
}

function isSequenceWithJoker(cards: Card[]): boolean {
  if (cards.length < 3) return false;

  const sortedRanks = cards.map(card => card.isJoker ? -1 : card.rank).sort((a, b) => a - b);
  const jokers = cards.filter(card => card.isJoker).length;

  let currentJokers = jokers;
  let prevRank = sortedRanks[0];

  for (let i = 1; i < sortedRanks.length; i++) {
    const currentRank = sortedRanks[i];
    if (currentRank === -1) continue; // ジョーカーはスキップ

    const diff = currentRank - prevRank;

    if (diff === 1) {
      // 連続している
    } else if (diff > 1) {
      // ギャップがある場合、ジョーカーで埋められるかチェック
      if (currentJokers >= diff - 1) {
        currentJokers -= (diff - 1);
      } else {
        return false; // ジョーカーが足りない
      }
    } else if (diff === 0) {
      return false; // 同じ数字が複数ある（階段ではない）
    } else if (diff < 0) {
      // ソートされているのでこれは起こらないはず
      return false;
    }
    prevRank = currentRank;
  }
  return true;
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

  const lastPlayed = gameState.lastPlayedCards;
  const numLastPlayed = lastPlayed.length;

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
    // 場にスペードの3が出された場合、ジョーカーを破る
    if (numLastPlayed === 1 && lastPlayed[0].suit === 'spade' && lastPlayed[0].rank === 3) {
      return { valid: false, message: 'スペードの3はジョーカーを破れません。' }; // スペードの3はジョーカーを破れない
    }
    return { valid: true }; // ジョーカー単独出しは常に有効
  }

  // スペードの3返し
  if (numPlayed === 1 && playedCards[0].suit === 'spade' && playedCards[0].rank === 3) {
    if (numLastPlayed === 1 && lastPlayed[0].isJoker) {
      return { valid: true }; // ジョーカーに対してスペードの3は有効
    } else {
      return { valid: false, message: 'スペードの3はジョーカーに対してのみ出せます。' };
    }
  }

  if (numLastPlayed > 0) { // 場にカードがある場合
    // 枚数が同じであること
    if (numPlayed !== numLastPlayed) {
      return { valid: false, message: `場と同じ枚数（${numLastPlayed}枚）のカードを出してください。` };
    }

    // 階段のチェック
    const isPlayedCardsSequence = isSequenceWithJoker(playedCards);
    const isLastPlayedCardsSequence = isSequenceWithJoker(lastPlayed);

    if (isLastPlayedCardsSequence && !isPlayedCardsSequence) {
      return { valid: false, message: '場は階段です。階段で返してください。' };
    }
    if (!isLastPlayedCardsSequence && isPlayedCardsSequence) {
      return { valid: false, message: '場は階段ではありません。階段で出すことはできません。' };
    }

    // 階段の場合、先頭のカードではなく、階段の最後のカードの強さで比較する
    // 4. 数字の強さチェック
    let lastCardStrength = getCardStrength(lastPlayed[lastPlayed.length - 1], gameState.currentRule.isRevolution, gameState.currentRule.isElevenBack);
    let playedCardStrength = getCardStrength(playedCards[playedCards.length - 1], gameState.currentRule.isRevolution, gameState.currentRule.isElevenBack);

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
    // ジョーカー単独出しは縛りの影響を受けない
    if (numPlayed === 1 && playedCards[0].isJoker) {
      return { valid: true };
    }

    // 記号縛り
    if (gameState.currentRule.suitBind) {
      // 出されたカードにジョーカーが含まれていても、他のカードが縛りに従っているかチェック
      const nonJokerPlayedCards = playedCards.filter(c => !c.isJoker);
      if (nonJokerPlayedCards.length > 0 && !nonJokerPlayedCards.every(c => c.suit === gameState.currentRule.suitBind)) {
        return { valid: false, message: `記号縛り中です。${gameState.currentRule.suitBind}のカードを出してください。` };
      }
    }
    // 数字縛り
    if (gameState.currentRule.rankBind) {
      // 出されたカードにジョーカーが含まれていても、他のカードが縛りに従っているかチェック
      const nonJokerPlayedCards = playedCards.filter(c => !c.isJoker);
      if (nonJokerPlayedCards.length > 0 && !nonJokerPlayedCards.every(c => c.rank === gameState.currentRule.rankBind)) {
        return { valid: false, message: `数字縛り中です。${gameState.currentRule.rankBind}のカードを出してください。` };
      }
    }

    // 両縛り (記号縛りと数字縛りが同時に適用されている場合)
    if (gameState.currentRule.suitBind && gameState.currentRule.rankBind) {
      const nonJokerPlayedCards = playedCards.filter(c => !c.isJoker);
      if (nonJokerPlayedCards.length > 0 && (!nonJokerPlayedCards.every(c => c.suit === gameState.currentRule.suitBind) || !nonJokerPlayedCards.every(c => c.rank === gameState.currentRule.rankBind))) {
        return { valid: false, message: `両縛り中です。${gameState.currentRule.suitBind}の${gameState.currentRule.rankBind}のカードのみ出せます。` };
      }
    }

    // 新たな縛りの発生判定はplayCardsイベントハンドラで行う
  }

  // 革命中の革命返しチェック
    if (gameState.currentRule.isRevolution && gameState.currentRule.revolutionTriggerCardCount > 0) {
      if (numPlayed !== gameState.currentRule.revolutionTriggerCardCount) {
        return { valid: false, message: `革命中です。${gameState.currentRule.revolutionTriggerCardCount}枚で返してください。` };
      }
    }

  return { valid: true };
}

// Helper to find the next active player
function getNextPlayerId(gameState: GameState, currentPlayerId: string): string {
  const playersInGame = gameState.players.filter(p => p.hand.length > 0); // 手札があるプレイヤーのみ
  if (playersInGame.length === 0) return ''; // ゲーム終了

  let currentIndex = playersInGame.findIndex(p => p.id === currentPlayerId);
  let nextIndex = (currentIndex + 1) % playersInGame.length;
  let nextPlayer = playersInGame[nextIndex];

  let passedCount = 0;
  for (const player of playersInGame) {
    if (player.hasPassed) {
      passedCount++;
    }
  }

  // 全員がパスした場合、最後にカードを出したプレイヤーのターンに戻す
  if (passedCount === playersInGame.length - 1 && gameState.lastPlayerId !== null) {
    return gameState.lastPlayerId;
  }

  // 次のパスしていないプレイヤーを探す
  let attempts = 0;
  while (nextPlayer.hasPassed && attempts < playersInGame.length) {
    nextIndex = (nextIndex + 1) % playersInGame.length;
    nextPlayer = playersInGame[nextIndex];
    attempts++;
  }

  // 全員がパスした場合、現在のプレイヤーのターンが継続
  if (nextPlayer.id === currentPlayerId && nextPlayer.hasPassed) {
    return currentPlayerId; 
  }
  return nextPlayer.id;
}

function endRound(gameState: GameState) {
  gameState.discardPile.push(...gameState.roundPlays.flatMap(p => p.cards));
  gameState.roundPlays = [];
  gameState.field = [];
  gameState.lastPlayedCards = [];
  gameState.currentRule.suitBind = null;
  gameState.currentRule.rankBind = null;
  gameState.currentRule.isElevenBack = false; // 11バックもリセット
  gameState.players.forEach(p => p.hasPassed = false);
  gameState.currentPlayerId = gameState.lastPlayerId!;
}

io.on('connection', (socket: Socket) => {
  console.log(`User connected: ${socket.id}`);

  // ルーム作成イベント
  socket.on('createRoom', (data: { playerName: string, maxPlayers: number, rules: any }) => {
    const roomId = `room-${Math.random().toString(36).substring(2, 9)}`; // ユニークなルームIDを生成
    const newRoom: Room = {
      id: roomId,
      ownerId: socket.id, // ルーム作成者がオーナー
      settings: {
        maxPlayers: data.maxPlayers,
        ...data.rules
      },
      players: [],
      gameState: null
    };
    rooms.set(roomId, newRoom);
    socket.join(roomId);
    const player: Player = { id: socket.id, name: data.playerName, hand: [], rank: null, hasPassed: false, isRich: false, isPoor: false, isCapitalFall: false };
    newRoom.players.push(player);
    io.to(roomId).emit('roomState', newRoom);
    console.log(`Room ${roomId} created by ${socket.id} with name ${data.playerName}`);
  });

  // ルーム参加イベント
  socket.on('joinRoom', (data: { playerName: string, roomId: string }) => {
    const room = rooms.get(data.roomId);
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    // プレイヤー名の重複チェック
    if (room.players.some(p => p.name === data.playerName)) {
      socket.emit('error', 'そのプレイヤー名は既に使用されています。');
      return;
    }
    if (room.players.length >= room.settings.maxPlayers) {
      socket.emit('error', 'Room is full');
      return;
    }

    socket.join(data.roomId);
    const player: Player = { id: socket.id, name: data.playerName, hand: [], rank: null, hasPassed: false, isRich: false, isPoor: false, isCapitalFall: false };
    room.players.push(player);
    io.to(data.roomId).emit('roomState', room);
    console.log(`User ${socket.id} joined room ${data.roomId}`);

    if (room.players.length === room.settings.maxPlayers) {
      // startGame(room);
    }
  });

  // ゲーム開始イベント
  socket.on('startGame', (roomId: string) => {
    const room = rooms.get(roomId);
    if (room && room.players.length >= 3) { // 最低3人からゲーム開始
      startGame(room);
    } else {
      socket.emit('error', 'ゲームを開始するには最低3人のプレイヤーが必要です。');
    }
  });

  // カードを出すイベント
  socket.on('playCards', (data: { roomId: string, cards: Card[] }) => {
    const room = rooms.get(data.roomId);
    if (!room || !room.gameState) {
      socket.emit('error', 'Game not in progress');
      return;
    }

    const isPlayedCardsSequence = isSequenceWithJoker(data.cards);

    const validationResult = isValidPlay(room.gameState, socket.id, data.cards);
    if (!validationResult.valid) {
      socket.emit('error', validationResult.message || '無効な手です。');
      return;
    }

    room.gameState.field = data.cards;
    room.gameState.lastPlayedCards = data.cards;
    room.gameState.lastPlayerId = socket.id;
    room.gameState.roundPlays.push({ playerId: socket.id, cards: data.cards });

    // 新たな縛りの発生判定
    // スート縛り
    if (room.gameState.roundPlays.length >= 2) {
      const lastTwoPlays = room.gameState.roundPlays.slice(-2);
      const firstPlayCards = lastTwoPlays[0].cards.filter(c => !c.isJoker);
      const secondPlayCards = lastTwoPlays[1].cards.filter(c => !c.isJoker);

      if (firstPlayCards.length > 0 && secondPlayCards.length > 0 &&
          firstPlayCards.every(c => c.suit === firstPlayCards[0].suit) &&
          secondPlayCards.every(c => c.suit === secondPlayCards[0].suit) &&
          firstPlayCards[0].suit === secondPlayCards[0].suit) {
        room.gameState.currentRule.suitBind = firstPlayCards[0].suit;
      }
    }

    // 数字縛り (階段が出された場合)
      // 階段の最初のカードのランクを数字縛りの基準とする
      const sortedRanks = data.cards.map(card => card.isJoker ? -1 : card.rank).sort((a, b) => a - b);
      const firstNonJokerRank = sortedRanks.find(rank => rank !== -1);
      if (firstNonJokerRank !== undefined) {
        room.gameState.currentRule.rankBind = firstNonJokerRank as Rank;
      }

    // 手札から出したカードを削除
    const currentPlayer = room.gameState.players.find(p => p.id === socket.id);
    if (currentPlayer) {
      for (const playedCard of data.cards) {
        const index = currentPlayer.hand.findIndex(c => c.suit === playedCard.suit && c.rank === playedCard.rank);
        if (index !== -1) {
          currentPlayer.hand.splice(index, 1);
        }
      }
      // カードが場に出されたアニメーションをクライアントに通知
      io.to(data.roomId).emit('cardPlayedAnimation', { playerId: socket.id, cards: data.cards });
    }

    // あがり判定
    if (currentPlayer && currentPlayer.hand.length === 0) {
      room.gameState.finishedPlayers.push(currentPlayer);
      console.log(`Player ${currentPlayer.name} has finished!`);

      // 都落ちの判定
      // 最初のあがりプレイヤーが、前回のゲームの大富豪ではない場合
      if (room.gameState.finishedPlayers.length === 1 && !currentPlayer.isRich) {
        const daifugoPlayer = room.gameState.players.find(p => p.isRich);
        // 大富豪プレイヤーが存在し、まだあがっていない場合
        if (daifugoPlayer && daifugoPlayer.hand.length > 0) {
          daifugoPlayer.isCapitalFall = true; // 都落ち状態にする
          daifugoPlayer.hand = []; // 手札を放棄させる
          console.log(`Player ${daifugoPlayer.name} has fallen from grace (Miyako-ochi)!`);
        }
      }
    }

    // Jバックの判定
    if (data.cards.some(card => card.rank === 11 && !card.isJoker)) { // J (ランク11)が含まれているか
      room.gameState.currentRule.isElevenBack = true;
    }

    // 革命の判定
    if (data.cards.length >= 4 && data.cards.every(c => c.rank === data.cards[0].rank)) {
      room.gameState.currentRule.isRevolution = !room.gameState.currentRule.isRevolution;
      room.gameState.currentRule.revolutionTriggerCardCount = data.cards.length; // 革命を起こしたカードの枚数を記録
    }

    // 8切りの判定と処理
    const hasEight = data.cards.some(card => card.rank === 8 && !card.isJoker);
    if (hasEight && !isPlayedCardsSequence) {
      endRound(room.gameState);
    } else if (data.cards.length === 1 && data.cards[0].suit === 'spade' && data.cards[0].rank === 3 && room.gameState.lastPlayedCards.length === 1 && room.gameState.lastPlayedCards[0].isJoker) {
      // スペ3返し
      endRound(room.gameState);
    } else if (data.cards.some(card => card.rank === 7 && !card.isJoker)) {
      // 7渡しを保留
      room.gameState.currentRule.isSevenTransfer = true;
      room.gameState.pendingSevenTransferPlayerId = socket.id;
      room.gameState.pendingSevenTransferCount = data.cards.length; // 出した枚数分渡す
      const nextPlayer = room.gameState && room.gameState.players.find(p => p.id === getNextPlayerId(room.gameState as GameState, socket.id));
      if (nextPlayer) {
        room.gameState.transferTargetPlayerId = nextPlayer.id;
      }
      // ターンは進めない
    } else if (data.cards.some(card => card.rank === 10 && !card.isJoker)) {
      // 10捨てを保留
      room.gameState.pendingTenDiscardPlayerId = socket.id;
      room.gameState.pendingTenDiscardCount = data.cards.length; // 出した枚数分捨てる
      // ターンは進めない
    } else {
      // 次のターンへ移譲
      const nextPlayerId = getNextPlayerId(room.gameState, socket.id);
      room.gameState.currentPlayerId = nextPlayerId;
    }

    io.to(data.roomId).emit('gameUpdate', room.gameState);
  });

  // カードを渡すイベント (7渡し用)
  socket.on('transferCards', (data: { roomId: string, cards: Card[] }) => {
    const room = rooms.get(data.roomId);
    if (!room || !room.gameState || room.gameState.pendingSevenTransferPlayerId !== socket.id) {
      socket.emit('error', 'カードを渡すフェーズではありません。');
      return;
    }

    const currentGameState = room.gameState;
    const currentPlayer = currentGameState.players.find(p => p.id === socket.id);
    const targetPlayer = currentGameState.players.find(p => p.id === currentGameState.transferTargetPlayerId);

    if (currentPlayer && targetPlayer) {
      if (data.cards.length !== room.gameState.pendingSevenTransferCount) {
        socket.emit('error', `7を出した枚数と同じ${room.gameState.pendingSevenTransferCount}枚のカードを渡してください。`);
        return;
      }

      const cardsToTransfer: Card[] = [];
      for (const card of data.cards) {
        const cardIndex = currentPlayer.hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
        if (cardIndex === -1) {
          socket.emit('error', '手札にないカードが含まれています。');
          return;
        }
        cardsToTransfer.push(currentPlayer.hand.splice(cardIndex, 1)[0]);
      }

      targetPlayer.hand.push(...cardsToTransfer);
      room.gameState.pendingSevenTransferPlayerId = null;
      room.gameState.transferTargetPlayerId = null;
      room.gameState.pendingSevenTransferCount = 0;
      room.gameState.currentRule.isSevenTransfer = false;

      // ターンを進める
      const nextPlayerId = getNextPlayerId(room.gameState, socket.id);
      room.gameState.currentPlayerId = nextPlayerId;
      
      io.to(data.roomId).emit('gameUpdate', room.gameState);
      // カードが渡されたアニメーションをクライアントに通知
      io.to(data.roomId).emit('cardTransferredAnimation', { fromPlayerId: socket.id, toPlayerId: targetPlayer.id, cards: cardsToTransfer });
    } else {
      socket.emit('error', 'プレイヤーが見つかりません。');
    }
  });

  // カードを捨てるイベント (10捨て用)
  socket.on('discardCards', (data: { roomId: string, cards: Card[] }) => {
    const room = rooms.get(data.roomId);
    if (!room || !room.gameState || room.gameState.pendingTenDiscardPlayerId !== socket.id) {
      socket.emit('error', 'カードを捨てるフェーズではありません。');
      return;
    }

    const currentPlayer = room.gameState.players.find(p => p.id === socket.id);

    if (currentPlayer) {
      if (data.cards.length !== room.gameState.pendingTenDiscardCount) {
        socket.emit('error', `10を出した枚数と同じ${room.gameState.pendingTenDiscardCount}枚のカードを捨ててください。`);
        return;
      }

      for (const card of data.cards) {
        const cardIndex = currentPlayer.hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
        if (cardIndex === -1) {
          socket.emit('error', '手札にないカードが含まれています。');
          return;
        }
        currentPlayer.hand.splice(cardIndex, 1);
      }

      room.gameState.pendingTenDiscardPlayerId = null;
      room.gameState.pendingTenDiscardCount = 0;
      room.gameState.currentRule.isTenDiscard = false; // 10捨てルールを解除

      // ターンを進める
      const nextPlayerId = getNextPlayerId(room.gameState, socket.id);
      room.gameState.currentPlayerId = nextPlayerId;
      
      io.to(data.roomId).emit('gameUpdate', room.gameState);
    } else {
      socket.emit('error', 'プレイヤーが見つかりません。');
    }
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

    const nextPlayerId = getNextPlayerId(room.gameState, socket.id);

    if (nextPlayerId === room.gameState.lastPlayerId) { // 全員がパスした場合
      endRound(room.gameState);
    } else {
      room.gameState.currentPlayerId = nextPlayerId;
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
        io.to(roomId).emit('roomState', room);
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
    players: room.players.map(p => ({ ...p, hand: p.hand, rank: null, hasPassed: false, isRich: false, isPoor: false, isCapitalFall: false })), // 手札をセット
    currentPlayerId: room.players[0].id, // 仮で最初のプレイヤー
    field: [],
    lastPlayedCards: [],
    discardPile: [], // 捨てられたカードの山を初期化
    lastPlayerId: null, // 直前にカードを出したプレイヤーのIDを初期化
    roundPlays: [],
    currentRule: {
      isRevolution: false,
      isEightCut: false,
      isSevenTransfer: false,
      isTenDiscard: false,
      isElevenBack: false,
      suitBind: null,
      rankBind: null,
      revolutionTriggerCardCount: 0, // 初期値は0
    },
    pendingSevenTransferPlayerId: null,
    transferTargetPlayerId: null,
    pendingSevenTransferCount: 0,
    pendingTenDiscardPlayerId: null,
    pendingTenDiscardCount: 0,
    gamePhase: 'playing',
    turnCount: 0,
    finishedPlayers: []
  };
  io.to(room.id).emit('gameStarted', room.gameState);
  io.to(room.id).emit('gameUpdate', room.gameState);
}

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});