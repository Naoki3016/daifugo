import React, { useState } from 'react';

interface RoomFormProps {
  onCreateRoom: (maxPlayers: number, rules: any) => void;
  onJoinRoom: (roomId: string) => void;
}

const RoomForm: React.FC<RoomFormProps> = ({ onCreateRoom, onJoinRoom }) => {
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [roomId, setRoomId] = useState('');

  const handleCreate = () => {
    onCreateRoom(maxPlayers, {}); // ルールは後で追加
  };

  const handleJoin = () => {
    onJoinRoom(roomId);
  };

  return (
    <div>
      <h2>ルームを作成</h2>
      <input
        type="number"
        value={maxPlayers}
        onChange={(e) => setMaxPlayers(Number(e.target.value))}
        min="2"
        max="5"
      />
      <button onClick={handleCreate}>作成</button>

      <h2>ルームに参加</h2>
      <input
        type="text"
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
        placeholder="ルームIDを入力"
      />
      <button onClick={handleJoin}>参加</button>
    </div>
  );
};

export default RoomForm;
