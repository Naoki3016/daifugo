export type Suit = 'spade' | 'heart' | 'diamond' | 'club' | 'joker';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13; // A=1, J=11, Q=12, K=13

export interface Card {
  suit: Suit;
  rank: Rank;
  // ジョーカーの場合、rankは0など特殊な値にするか、別途isJokerフラグを持つ
  isJoker?: boolean;
}

export interface Player {
  id: string; // Socket.id またはユーザーID
  name: string;
  hand: Card[]; // 手札
  rank: 'daifugo' | 'fugo' | 'heimin' | 'hinmin' | 'daihinmin' | null; // 現在の順位
  hasPassed: boolean; // パスしたかどうか
  isRich: boolean; // 大富豪だったか
  isPoor: boolean; // 大貧民だったか
  isCapitalFall: boolean; // 都落ち状態か
  // その他、プレイヤー固有の状態（都落ちフラグなど）
}

export interface GameState {
  roomId: string;
  players: Player[];
  currentPlayerId: string; // 現在のターンのプレイヤーID
  field: Card[]; // 場に出ているカード
  lastPlayedCards: Card[]; // 直前に出されたカード（縛り判定などに使用）
  currentRule: {
    isRevolution: boolean; // 革命中かどうか
    isEightCut: boolean; // 8切りが適用されたか
    isSevenTransfer: boolean; // 7渡しが適用されたか
    isTenDiscard: boolean; // 10捨てが適用されたか
    isElevenBack: boolean; // 11バックが適用されたか
    suitBind: Suit | null; // 記号縛りのスート
    rankBind: Rank | null; // 数字縛りのランク
    // その他、適用中の特殊ルール
  };
  gamePhase: 'waiting' | 'playing' | 'cardExchange' | 'finished';
  turnCount: number; // ターン数（都落ち判定用など）
  finishedPlayers: Player[]; // あがったプレイヤーの順位を記録
  // その他、ゲーム全体の状態
}

export interface Room {
  id: string;
  settings: {
    maxPlayers: number;
    // ルール設定（階段の枚数、ジョーカーの扱いなど）
  };
  players: Player[]; // ルームに参加しているプレイヤー
  gameState: GameState | null; // ゲームが開始されたらGameStateを持つ
}
