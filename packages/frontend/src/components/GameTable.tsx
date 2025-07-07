import React, { useState, useEffect } from 'react';
import type { GameState, Room, Card } from '@daifugo/common';
import './GameTable.css';

interface GameTableProps {
  gameState: GameState;
  room: Room;
  onPlayCards: (cards: Card[]) => void;
  onPass: () => void;
  onTransferCards: (cards: Card[]) => void;
  onDiscardCards: (cards: Card[]) => void;
  currentPlayerId: string;
}

const GameTable: React.FC<GameTableProps> = ({
  gameState,
  room,
  onPlayCards,
  onPass,
  onTransferCards,
  onDiscardCards,
  currentPlayerId,
}) => {
  const [selectedCards, setSelectedCards] = useState<Card[]>([]);
  const [showRoundAnimation, setShowRoundAnimation] = useState(false);
  const [animatingCards, setAnimatingCards] = useState<Card[]>([]);
  const [discardingCards, setDiscardingCards] = useState<Card[]>([]);
  const [newlyDealtCards, setNewlyDealtCards] = useState<Card[]>([]);

  const currentPlayer = gameState.players.find(p => p.id === currentPlayerId);
  const otherPlayers = gameState.players.filter(p => p.id !== currentPlayerId);

  useEffect(() => {
    // ラウンド開始アニメーション
    if (gameState.turnCount === 0) { // ゲーム開始時
      setShowRoundAnimation(true);
      const timer = setTimeout(() => setShowRoundAnimation(false), 2000); // 2秒表示
      return () => clearTimeout(timer);
    } else if (gameState.lastPlayedCards.length === 0 && gameState.field.length === 0 && gameState.roundPlays.length === 0) { // ラウンド終了時
      setShowRoundAnimation(true);
      const timer = setTimeout(() => setShowRoundAnimation(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [gameState.turnCount, gameState.lastPlayedCards, gameState.field, gameState.roundPlays]);

  useEffect(() => {
    // カードが場に出された時のアニメーション
    if (gameState.lastPlayedCards.length > 0) {
      setAnimatingCards(gameState.lastPlayedCards);
      const timer = setTimeout(() => setAnimatingCards([]), 500); // アニメーション後クリア
      return () => clearTimeout(timer);
    }
  }, [gameState.lastPlayedCards]);

  useEffect(() => {
    // カードが捨てられた時のアニメーション
    if (gameState.discardPile.length > 0 && gameState.discardPile.length > discardingCards.length) { // 捨て札が増えたら
      const newDiscardedCards = gameState.discardPile.slice(discardingCards.length);
      setDiscardingCards(newDiscardedCards);
      const timer = setTimeout(() => setDiscardingCards([]), 1000); // アニメーション後クリア
      return () => clearTimeout(timer);
    }
  }, [gameState.discardPile]);

  useEffect(() => {
    // 新しい手札が配られた時のアニメーション
    const currentHand = currentPlayer ? currentPlayer.hand : [];
    const previousHand = room.players.find(p => p.id === currentPlayerId)?.hand || [];

    if (currentHand.length > previousHand.length) {
      const addedCards = currentHand.filter(card => !previousHand.some(prevCard => prevCard.suit === card.suit && prevCard.rank === card.rank));
      setNewlyDealtCards(addedCards);
      const timer = setTimeout(() => setNewlyDealtCards([]), 1000); // アニメーション後クリア
      return () => clearTimeout(timer);
    }
  }, [currentPlayer?.hand]);

  const handleCardClick = (card: Card) => {
    setSelectedCards((prevSelected) => {
      const index = prevSelected.findIndex(
        (c) => c.suit === card.suit && c.rank === card.rank
      );
      if (index !== -1) {
        return prevSelected.filter((_, i) => i !== index);
      } else {
        return [...prevSelected, card];
      }
    });
  };

  const handlePlay = () => {
    onPlayCards(selectedCards);
    setSelectedCards([]);
  };

  const handlePassClick = () => {
    onPass();
    setSelectedCards([]);
  };

  const renderCard = (card: Card, index: number, isSelected: boolean = false) => {
    const cardImage = card.isJoker
      ? `/assets/cards/jorker${card.rank === 0 ? 1 : 2}.png` // Assuming two joker images
      : `/assets/cards/${card.suit.charAt(0)}${card.rank}.png`;
    return (
      <img
        key={index}
        src={cardImage}
        alt={`${card.suit} ${card.rank}`}
        className={`card ${isSelected ? 'selected' : ''}`}
        style={{ left: `${index * 2.5}vw` }} // Adjust for overlapping effect
      />
    );
  };

  // プレイヤーの配置を計算するヘルパー関数
  const getPlayerPosition = (index: number, totalPlayers: number) => {
    const angle = (360 / totalPlayers) * index; // 円周上の角度
    const radius = 150; // 円の半径（適宜調整）
    const x = radius * Math.cos(angle * Math.PI / 180);
    const y = radius * Math.sin(angle * Math.PI / 180);
    return { transform: `translate(${x}px, ${y}px)` };
  };

  return (
    <div className="game-table">
      {showRoundAnimation && (
        <div className="round-animation">
          <h1>{gameState.turnCount === 0 ? 'ゲーム開始' : 'ラウンド開始'}</h1>
        </div>
      )}

      {/* Player Info Area */}
      <div className="player-info-container">
        {otherPlayers.map((player, index) => (
          <div
            key={player.id}
            className="player-info other-player"
            style={getPlayerPosition(index, otherPlayers.length)}
          >
            <div className="player-avatar"></div>
            <div className="player-name">{player.name}</div>
            <div className="player-hand-count">{player.hand.length}枚</div>
          </div>
        ))}
      </div>

      {/* Central Play Area */}
      <div className="central-play-area">
        <div className="played-cards">
          {gameState.lastPlayedCards.map((card, index) => renderCard(card, index))}
        </div>
        {animatingCards.map((card, index) => (
          <img
            key={`animating-${card.suit}-${card.rank}-${index}`}
            src={card.isJoker ? `/assets/cards/jorker${card.rank === 0 ? 1 : 2}.png` : `/assets/cards/${card.suit.charAt(0)}${card.rank}.png`}
            alt={`${card.suit} ${card.rank}`}
            className="card animating-card"
            style={{
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              opacity: 0,
            }}
          />
        ))}
        {discardingCards.map((card, index) => (
          <img
            key={`discarding-${card.suit}-${card.rank}-${index}`}
            src={card.isJoker ? `/assets/cards/jorker${card.rank === 0 ? 1 : 2}.png` : `/assets/cards/${card.suit.charAt(0)}${card.rank}.png`}
            alt={`${card.suit} ${card.rank}`}
            className="card discarding-card animate-out"
            style={{
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          />
        ))}
        {/* Rule Display Area */}
        <div className="rule-display-area">
          {gameState.currentRule.isRevolution && <span className="rule-tag">革命中</span>}
          {gameState.currentRule.isElevenBack && <span className="rule-tag">11バック中</span>}
          {gameState.currentRule.suitBind && <span className="rule-tag">{gameState.currentRule.suitBind}縛り</span>}
          {gameState.currentRule.rankBind && <span className="rule-tag">数字縛り</span>}
        </div>
      </div>

      {/* Current Player Hand Area */}
      <div className="my-hand-area">
        {currentPlayer &&
          currentPlayer.hand.map((card, index) => (
            <div
              key={`${card.suit}-${card.rank}-${index}`}
              className={`my-card-wrapper ${selectedCards.some(c => c.suit === card.suit && c.rank === card.rank) ? 'selected' : ''}`}
              onClick={() => handleCardClick(card)}
              style={{ left: `${index * 30}px` }} // Overlapping effect
            >
              {renderCard(card, index)}
            </div>
          ))}
        {newlyDealtCards.map((card, index) => (
          <img
            key={`newly-dealt-${card.suit}-${card.rank}-${index}`}
            src={card.isJoker ? `/assets/cards/jorker${card.rank === 0 ? 1 : 2}.png` : `/assets/cards/${card.suit.charAt(0)}${card.rank}.png`}
            alt={`${card.suit} ${card.rank}`}
            className="card newly-dealt-card animate-in"
            style={{ '--card-offset': `${index * 30}px` } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Operation Button Area */}
      <div className="operation-button-area">
        <button onClick={handlePlay} disabled={selectedCards.length === 0 || gameState.currentPlayerId !== currentPlayerId}>
          出す
        </button>
        <button onClick={handlePassClick} disabled={gameState.currentPlayerId !== currentPlayerId}>
          パス
        </button>
      </div>

      {/* 7渡し/10捨てのUI */}
      {(gameState.pendingSevenTransferPlayerId === currentPlayerId || gameState.pendingTenDiscardPlayerId === currentPlayerId) && (
        <div className="transfer-discard-overlay">
          <h3>{gameState.pendingSevenTransferPlayerId === currentPlayerId ? 'カードを渡してください' : 'カードを捨ててください'}</h3>
          <p>{gameState.pendingSevenTransferPlayerId === currentPlayerId ? `${gameState.pendingSevenTransferCount}枚` : `${gameState.pendingTenDiscardCount}枚`}選択中</p>
          <div className="transfer-discard-buttons">
            {gameState.pendingSevenTransferPlayerId === currentPlayerId && (
              <button onClick={() => onTransferCards(selectedCards)} disabled={selectedCards.length !== gameState.pendingSevenTransferCount}>
                渡す
              </button>
            )}
            {gameState.pendingTenDiscardPlayerId === currentPlayerId && (
              <button onClick={() => onDiscardCards(selectedCards)} disabled={selectedCards.length !== gameState.pendingTenDiscardCount}>
                捨てる
              </button>
            )}
          </div>
        </div>
      )}

      {/* Current Player Info (Bottom Left) */}
      {currentPlayer && (
        <div className="player-info current-player-info">
          <div className="player-avatar"></div>
          <div className="player-name">{currentPlayer.name}</div>
          <div className="player-hand-count">{currentPlayer.hand.length}枚</div>
        </div>
      )}
    </div>
  );
};

export default GameTable;
