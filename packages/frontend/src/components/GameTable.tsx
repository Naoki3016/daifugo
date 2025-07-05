import React from 'react';
import type { GameState, Card } from '@daifugo/common'; // バックエンドの型定義をインポート

interface GameTableProps {
  gameState: GameState;
  myPlayerId: string;
  onPlayCards: (cards: Card[]) => void;
  onPass: () => void;
}

const GameTable: React.FC<GameTableProps> = ({ gameState, myPlayerId, onPlayCards, onPass }) => {
  const myPlayer = gameState.players.find(p => p.id === myPlayerId);
  const isMyTurn = gameState.currentPlayerId === myPlayerId;

  // TODO: 選択中のカードを管理するstate
  const [selectedCards, setSelectedCards] = React.useState<Card[]>([]);

  const handleCardClick = (card: Card) => {
    // 既に選択されているかチェック
    const isSelected = selectedCards.some(
      (c) => c.suit === card.suit && c.rank === card.rank
    );

    if (isSelected) {
      // 選択解除
      setSelectedCards((prev) =>
        prev.filter((c) => c.suit !== card.suit || c.rank !== card.rank)
      );
    } else {
      // 選択
      setSelectedCards((prev) => [...prev, card]);
    }
  };

  const handlePlay = () => {
    onPlayCards(selectedCards);
    setSelectedCards([]);
  };

  const handlePass = () => {
    onPass();
  };

  if (!myPlayer) return <div>プレイヤー情報が見つかりません。</div>;

  return (
    <div>
      <h2>ゲーム画面 - ルームID: {gameState.roomId}</h2>
      <h3>現在のターン: {gameState.players.find(p => p.id === gameState.currentPlayerId)?.name}</h3>

      <h4>場のカード:</h4>
      <div>
        {gameState.field.length > 0 ? (
          gameState.field.map((card, index) => (
            <span key={index} style={{ marginRight: '5px' }}>
              {card.suit}{card.rank}
            </span>
          ))
        ) : (
          <span>場にカードはありません。</span>
        )}
      </div>

      <h4>手札:</h4>
      <div>
        {myPlayer.hand.map((card, index) => (
          <button key={index} onClick={() => handleCardClick(card)}>
            {card.suit}{card.rank}
          </button>
        ))}
      </div>

      {isMyTurn && (
        <div>
          <button onClick={handlePlay} disabled={selectedCards.length === 0}>出す</button>
          <button onClick={handlePass}>パス</button>
        </div>
      )}

      <h4>プレイヤーリスト:</h4>
      <ul>
        {gameState.players.map((player) => (
          <li key={player.id}>
            {player.name} ({player.hand.length}枚) {player.id === gameState.currentPlayerId && '(現在のターン)'}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default GameTable;
