
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const MAX_PLAYERS = 4;

io.on("connection", (socket) => {
  console.log("Oyuncu bağlandı:", socket.id);

  socket.on("joinGame", (data, callback) => {
    const roomCode = String(data?.roomCode || "");
    const playerId = String(data?.playerId || "");
    const isHost = data?.isHost === true;

    const reply = (result) => {
      if (typeof callback === "function") {
        callback(result);
      }
    };

    if (
      !/^\d{4,6}$/.test(roomCode) ||
      !playerId ||
      playerId.length > 100
    ) {
      return reply({
        success: false,
        message: "Oda bilgileri geçersiz."
      });
    }

    let room = rooms.get(roomCode);

    if (!room) {
      if (!isHost) {
        return reply({
          success: false,
          message: "Oda bulunamadı. Oda kodunu kontrol et."
        });
      }

      room = { players: new Map() };
      rooms.set(roomCode, room);
    }

    const oldSocketId = room.players.get(playerId);

    if (!oldSocketId && room.players.size >= MAX_PLAYERS) {
      return reply({
        success: false,
        message: "Oda dolu. En fazla 4 oyuncu katılabilir."
      });
    }

    if (oldSocketId && oldSocketId !== socket.id) {
      const oldSocket = io.sockets.sockets.get(oldSocketId);

      if (oldSocket) {
        oldSocket.leave(roomCode);
        oldSocket.data.gameRoom = null;
        oldSocket.data.playerId = null;
      }
    }

    if (
      socket.data.gameRoom &&
      socket.data.gameRoom !== roomCode
    ) {
      const previousRoomCode = socket.data.gameRoom;
      const previousRoom = rooms.get(previousRoomCode);

      if (previousRoom) {
        previousRoom.players.delete(socket.data.playerId);

        socket.to(previousRoomCode).emit("gamePlayerLeft", {
          playerId: socket.data.playerId
        });

        if (previousRoom.players.size === 0) {
          rooms.delete(previousRoomCode);
        }
      }

      socket.leave(previousRoomCode);
    }

    room.players.set(playerId, socket.id);

    socket.join(roomCode);
    socket.data.gameRoom = roomCode;
    socket.data.playerId = playerId;

    console.log("Oyuncu odaya katıldı:", roomCode, playerId);

    reply({
      success: true,
      roomCode
    });
  });

  socket.on("gameMessage", (packet) => {
    const roomCode = socket.data.gameRoom;

    if (!roomCode || !rooms.has(roomCode)) return;
    if (!packet || typeof packet !== "object") return;

    socket.to(roomCode).emit("gameMessage", {
      from: socket.data.playerId,
      data: packet
    });
  });

  socket.on("gameDirect", (packet) => {
    const roomCode = socket.data.gameRoom;

    if (!roomCode || !packet || typeof packet !== "object") {
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) return;

    const targetSocketId = room.players.get(
      String(packet.to || "")
    );

    if (!targetSocketId) return;

    io.to(targetSocketId).emit("gameDirect", {
      from: socket.data.playerId,
      data: packet.data
    });
  });

  socket.on("disconnect", () => {
    const roomCode = socket.data.gameRoom;
    const playerId = socket.data.playerId;

    if (!roomCode || !playerId) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    if (room.players.get(playerId) === socket.id) {
      room.players.delete(playerId);

      socket.to(roomCode).emit("gamePlayerLeft", {
        playerId
      });
    }

    if (room.players.size === 0) {
      rooms.delete(roomCode);
    }

    console.log("Oyuncu ayrıldı:", playerId);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    "Karanlık Koridor sunucusu " +
    PORT +
    " portunda çalışıyor!"
  );
});
