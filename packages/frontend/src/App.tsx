import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Room, GameState, Card } from '@daifugo/common';
import './App.css';
import WaitingRoom from './components/WaitingRoom';
import GameTable from './components/GameTable';

const SERVER_URL = 'https://02de6151-6003-4198-a434-874e8f83fb22-00-1d1wfn0plma73.sisko.replit.dev'; // バックエンドのURL

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [playerName, setPlayerName] = useState<string>('');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isGameStarted, setIsGameStarted] = useState<boolean>(false);

  useEffect(() => {
    const newSocket = io(SERVER_URL, { path: '/socket.io/' });
    setSocket(newSocket);

    newSocket.on('roomState', (updatedRoom: Room) => {
      setRoom(updatedRoom);
      if (updatedRoom.gameState) {
        setGameState(updatedRoom.gameState);
        setIsGameStarted(true);
      }
    });

    newSocket.on('gameStarted', (initialGameState: GameState) => {
      setGameState(initialGameState);
      setIsGameStarted(true);
    });

    newSocket.on('gameUpdate', (updatedGameState: GameState) => {
      setGameState(updatedGameState);
    });

    newSocket.on('error', (message: string) => {
      alert(message);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const handleCreateRoom = (name: string, maxPlayers: number, rules: any) => {
    if (socket) {
      setPlayerName(name);
      socket.emit('createRoom', { playerName: name, maxPlayers, rules });
    }
  };

  const handleJoinRoom = (name: string, id: string) => {
    if (socket) {
      setPlayerName(name);
      socket.emit('joinRoom', { playerName: name, roomId: id });
    }
  };

  const handleStartGame = () => {
    if (socket && room) {
      socket.emit('startGame', room.id);
    }
  };

  const handlePlayCards = (cards: Card[]) => {
    if (socket && room) {
      socket.emit('playCards', { roomId: room.id, cards });
    }
  };

  const handlePass = () => {
    if (socket && room) {
      socket.emit('pass', room.id);
    }
  };

  const handleTransferCards = (cards: Card[]) => {
    if (socket && room) {
      socket.emit('transferCards', { roomId: room.id, cards });
    }
  };

  const handleDiscardCards = (cards: Card[]) => {
    if (socket && room) {
      socket.emit('discardCards', { roomId: room.id, cards });
    }
  };

  return (
    <div className="game-container">
      {!isGameStarted && (
        <WaitingRoom
          room={room}
          playerName={playerName}
          myPlayerId={socket?.id || null}
          onJoinRoom={handleJoinRoom}
          onCreateRoom={handleCreateRoom}
          onStartGame={handleStartGame}
        />
      )}
      {isGameStarted && gameState && room && socket && (
        <GameTable
          gameState={gameState}
          room={room}
          onPlayCards={handlePlayCards}
          onPass={handlePass}
          onTransferCards={handleTransferCards}
          onDiscardCards={handleDiscardCards}
          currentPlayerId={socket.id || ''}
        />
      )}
    </div>
  );
}

export default App;
