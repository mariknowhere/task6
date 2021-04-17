const express = require('express');
const app = express();
const path = require('path');
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: '*',
  },
});
const port = process.env.PORT || 3000;
const {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  ERRORS,
} = require('./src/events.js');

const APP_PAGE_PATH = './dist/tic-tac-toe';

app.use(express.static(path.join(__dirname, APP_PAGE_PATH)))
  .get('/*', (req, res) => res.sendFile('index.html', { root: APP_PAGE_PATH }));

function isDraw(game) {
  return !findWinner(game) && game.moves.every(row => row.every(Boolean));
}

function findWinner(game) {
  if (isWinner(game.moves, 'x')) {
    return game.hostPlayer;
  }

  if (isWinner(game.moves, 'o')) {
    return game.joinedPlayer;
  }

  return null;
}

function selectOneFromPair(first, second) {
  return Math.random() > 0.5 ? first : second;
}

function isWinner(moves, value) {
  return moves.some(row => isRowFull(row, value))
    || moves.some((row, index) => isColumnFull(moves, index, value))
    || isDiagonalFull(moves, value)
    || isReversedDiagonalFull(moves, value);
}

function isRowFull(row, value) {
  return row.every(item => item === value);
}

function isColumnFull(rows, columnIndex, value) {
  return rows.every(row => row[columnIndex] === value);
}

function isDiagonalFull(rows, value) {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];

    if (row[rowIndex] !== value) {
      return false;
    }
  }

  return true;
}

function isReversedDiagonalFull(rows, value) {
  for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex--) {
    const row = rows[Math.abs(rowIndex - (rows.length - 1))];

    if (row[rowIndex] !== value) {
      return false;
    }
  }

  return true;
}

const hosts = [];

const getHosts = () => ({
  hosts: hosts.map(room => ({ hostName: room.socket.username, tags: room.tags })),
});

const removeRoom = (username) => {
  const indexOfRoom = hosts.findIndex(room => room.socket.username === username);

  if (indexOfRoom !== -1) {
    hosts.splice(indexOfRoom, 1);
  }
};

const addRoom = (socket, tags ) => hosts.push({ socket, tags });

const findRoom = (hostName) => hosts.find(host => host.socket.username === hostName);

const createGame = (hostName, username) => ({
  moves: [
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ],
  hostPlayer: hostName,
  joinedPlayer: username,
});

const usernames = [];
const addUsername = username => usernames.push(username);
const removeUsername = username => usernames.splice(usernames.indexOf(username), 1);

const emitHostedGames = () => io.sockets.emit(SERVER_EVENTS.UPDATE_HOSTS, getHosts());
const emitHostedGamesLocally = socket => socket.emit(SERVER_EVENTS.UPDATE_HOSTS, getHosts());

io.use((socket, next) => {
  const username = socket.handshake.auth.username;

  if (!username || usernames.includes(username)) {
    return next(new Error(ERRORS.INVALID_USERNAME));
  }

  socket.username = username;
  next();
});

io.on('connection', socket => {
  const username = socket.username;
  addUsername(username);
  emitHostedGamesLocally(socket);

  socket.on(CLIENT_EVENTS.HOST_GAME, ({ tags }) => {
    addRoom(socket, tags);
    emitHostedGames();
  });

  socket.on(CLIENT_EVENTS.STOP_HOST, () => {
    removeRoom(username);
    emitHostedGames();
  });

  socket.on(CLIENT_EVENTS.JOIN_GAME, ({ hostName }) => {
    const room = findRoom(hostName);
    const game = createGame(hostName, username);
    removeRoom(hostName);
    emitHostedGames();

    startGame(socket, room.socket, game);
  });

  socket.on(CLIENT_EVENTS.DISCONNECT, () => {
    removeUsername(username);
    removeRoom(username);
  });
});

const startGame = (joinedSocket, hostSocket, game) => {
  const sendGameUpdate = (blockedUser) => {
    const gameWithBlockedUser = {...game, blockedUser };
    joinedSocket.emit(SERVER_EVENTS.GAME_UPDATE, gameWithBlockedUser);
    hostSocket.emit(SERVER_EVENTS.GAME_UPDATE, gameWithBlockedUser);
  };
  const stopGame = () => {
    // TODO: emit another leave game
    joinedSocket.removeAllListeners(CLIENT_EVENTS.MOVE);
    hostSocket.removeAllListeners(CLIENT_EVENTS.MOVE);
  };
  const performMove = (move, blockedUser) => {
    game.moves[move.y][move.x] = move.value;
    game.lastWentPerform = joinedSocket.username;
    const winner = findWinner(game);
    const draw = isDraw(game);

    sendGameUpdate(blockedUser);

    if (winner || draw) {
      joinedSocket.emit(SERVER_EVENTS.WIN, { winner, isDraw: draw });
      hostSocket.emit(SERVER_EVENTS.WIN, { winner, isDraw: draw });
      stopGame();
    }
  };

  hostSocket.on(CLIENT_EVENTS.MOVE, move => performMove(move, hostSocket.username));
  joinedSocket.on(CLIENT_EVENTS.MOVE, move => performMove(move, joinedSocket.username));

  hostSocket.once(CLIENT_EVENTS.DISCONNECT, stopGame);
  joinedSocket.once(CLIENT_EVENTS.DISCONNECT, stopGame);

  const initiallyBlockedUser = selectOneFromPair(hostSocket.username, joinedSocket.username);
  sendGameUpdate(initiallyBlockedUser);
};

server.listen(port, () => console.log(`Listening on ${port}`));
