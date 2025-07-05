import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import RoomForm from './components/RoomForm';
import WaitingRoom from './components/WaitingRoom';
import GameTable from './components/GameTable';
import type { Room, GameState, Player, Card } from '@daifugo/common'; // バックエンドの型定義をインポート

// Replit のバックエンドURLに置き換える
const SOCKET_SERVER_URL = 'https://daifugo-backend.your-username.replit.co/'; // 例: https://daifugo-backend.your-username.replit.co/

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);

  useEffect(() => {
    const newSocket = io(SOCKET_SERVER_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to backend');
      setMyPlayerId(newSocket.id || null); // 自分のSocket IDを保存
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from backend');
      setCurrentRoom(null);
      setGameState(null);
      setMyPlayerId(null);
      setIsHost(false);
    });

    newSocket.on('roomCreated', (data: { roomId: string, room: Room }) => {
      setCurrentRoom(data.room);
      setIsHost(true);
      console.log('Room created:', data.roomId);
    });

    newSocket.on('roomJoined', (data: { roomId: string, room: Room }) => {
      setCurrentRoom(data.room);
      setIsHost(false); // 参加者はホストではない
      console.log('Room joined:', data.roomId);
    });

    newSocket.on('playerJoined', (data: { player: Player, room: Room }) => {
      setCurrentRoom(data.room);
      console.log('Player joined:', data.player.name);
    });

    newSocket.on('playerLeft', (data: { playerId: string, room: Room }) => {
      setCurrentRoom(data.room);
      console.log('Player left:', data.playerId);
    });

    newSocket.on('gameStarted', (state: GameState) => {
      setGameState(state);
      console.log('Game started!');
    });

    newSocket.on('gameUpdate', (state: GameState) => {
      setGameState(state);
      console.log('Game updated!');
    });

    newSocket.on('gameEnd', (data: { message: string, finishedPlayers: Player[] }) => {
      console.log('Game ended:', data.message);
      console.log('Finished Players:', data.finishedPlayers);
      // ゲーム終了後の処理（カード交換フェーズへの移行など）
      setGameState(null); // ゲーム状態をリセット
      setCurrentRoom(prev => prev ? { ...prev, players: data.finishedPlayers } : null); // 順位を反映
    });

    newSocket.on('error', (message: string) => {
      alert(`エラー: ${message}`);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const handleCreateRoom = (maxPlayers: number, rules: any) => {
    if (socket) {
      socket.emit('createRoom', { maxPlayers, rules });
    }
  };

  const handleJoinRoom = (roomId: string) => {
    if (socket) {
      socket.emit('joinRoom', roomId);
    }
  };

  const handleStartGame = () => {
    if (socket && currentRoom) {
      socket.emit('startGame', currentRoom.id); // バックエンドにゲーム開始を通知
    }
  };

  const handlePlayCards = (cards: Card[]) => {
    if (socket && currentRoom) {
      socket.emit('playCards', { roomId: currentRoom.id, cards });
    }
  };

  const handlePass = () => {
    if (socket && currentRoom) {
      socket.emit('pass', currentRoom.id);
    }
  };

  let content;
  if (!currentRoom) {
    content = <RoomForm onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} />;
  } else if (currentRoom && !gameState) {
    content = (
      <WaitingRoom
        roomId={currentRoom.id}
        players={currentRoom.players}
        isHost={isHost}
        onStartGame={handleStartGame}
      />
    );
  } else if (gameState) {
    content = (
      <GameTable
        gameState={gameState}
        myPlayerId={myPlayerId || ''}
        onPlayCards={handlePlayCards}
        onPass={handlePass}
      />
    );
  }

  return (
    <div className="App">
      <h1>オンライン大富豪</h1>
      {content}
    </div>
  );
}

export default App;
