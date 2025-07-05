import React from 'react';
import type { Player } from '@daifugo/common'; // バックエンドの型定義をインポート

interface WaitingRoomProps {
  roomId: string;
  players: Player[];
  isHost: boolean;
  onStartGame: () => void;
}

const WaitingRoom: React.FC<WaitingRoomProps> = ({ roomId, players, isHost, onStartGame }) => {
  return (
    <div>
      <h2>ルームID: {roomId}</h2>
      <h3>参加者 ({players.length}人)</h3>
      <ul>
        {players.map((player) => (
          <li key={player.id}>{player.name}</li>
        ))}
      </ul>
      {isHost && players.length >= 2 && ( // 2人以上でゲーム開始可能とする
        <button onClick={onStartGame}>ゲーム開始</button>
      )}
    </div>
  );
};

export default WaitingRoom;
