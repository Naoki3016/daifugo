import React, { useState } from 'react';
import type { Room } from '@daifugo/common';

interface WaitingRoomProps {
  room: Room | null;
  myPlayerId: string | null;
  playerName: string;
  onJoinRoom: (name: string, id: string) => void;
  onCreateRoom: (playerName: string, maxPlayers: number, rules: any) => void;
  onStartGame: () => void;
}

const WaitingRoom: React.FC<WaitingRoomProps> = ({ room, myPlayerId, playerName, onJoinRoom, onCreateRoom, onStartGame }) => {
  const [inputPlayerName, setInputPlayerName] = useState(playerName);
  const [inputRoomId, setInputRoomId] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4); // Default to 4 players
  const [copySuccess, setCopySuccess] = useState('');

  const handleCreateRoomClick = () => {
    if (inputPlayerName) {
      onCreateRoom(inputPlayerName, maxPlayers, {}); // Pass empty rules for now
    } else {
      alert('プレイヤー名を入力してください。');
    }
  };

  const handleJoinRoomClick = () => {
    if (inputPlayerName && inputRoomId) {
      onJoinRoom(inputPlayerName, inputRoomId);
    } else {
      alert('プレイヤー名とルームIDを入力してください。');
    }
  };

  const copyRoomIdToClipboard = async () => {
    if (!room) return; // roomがnullの場合は何もしない
    try {
      await navigator.clipboard.writeText(room.id);
      setCopySuccess('コピーしました！');
    } catch (err) {
      setCopySuccess('コピーに失敗しました。');
    }
    setTimeout(() => setCopySuccess(''), 2000); // 2秒後にメッセージを消す
  };

  if (!room) {
    return (
      <div className="waiting-room-container">
        <h2>大富豪</h2>
        <div className="input-group">
          <label htmlFor="playerName">プレイヤー名:</label>
          <input
            id="playerName"
            type="text"
            value={inputPlayerName}
            onChange={(e) => setInputPlayerName(e.target.value)}
            placeholder="あなたの名前"
          />
        </div>
        <div className="input-group">
          <label htmlFor="maxPlayers">最大プレイヤー数:</label>
          <input
            id="maxPlayers"
            type="number"
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))}
            min="2"
            max="10"
          />
        </div>
        <button onClick={handleCreateRoomClick}>ルーム作成</button>
        <div className="input-group">
          <label htmlFor="roomId">ルームID:</label>
          <input
            id="roomId"
            type="text"
            value={inputRoomId}
            onChange={(e) => setInputRoomId(e.target.value)}
            placeholder="参加するルームID"
          />
        </div>
        <button onClick={handleJoinRoomClick}>ルーム参加</button>
      </div>
    );
  }

  const isHost = room.players.length > 0 && room.players[0].id === myPlayerId;

  return (
    <div className="waiting-room-container">
      <h2>待機ルーム</h2>
      <p>
        ルームID: {room.id}
        <button onClick={copyRoomIdToClipboard} className="copy-button">コピー</button>
        {copySuccess && <span className="copy-success-message">{copySuccess}</span>}
      </p>
      <h3>参加者:</h3>
      <ul>
        {room.players.map(player => (
          <li key={player.id}>
            {player.name} {player.id === myPlayerId && '(あなた)'}
            {room.ownerId === player.id && !room.gameState && <span className="owner-tag">(オーナー)</span>}
          </li>
        ))}
      </ul>
      {isHost && (
        <button onClick={onStartGame} className="start-game-button">ゲーム開始</button>
      )}
    </div>
  );
};

export default WaitingRoom;
