/*************/
/*** SETUP ***/
/*************/
const bodyParser = require('body-parser')
const path = require('path');
const http = require('http');
const express = require('express');
const socketio = require('socket.io');
const formatMessage = require('./utils/messages');
const {
  userJoin,
  getCurrentUser,
  userLeave,
  getRoomUsers
} = require('./utils/users');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Set static folder
app.use(express.static(path.join(__dirname, 'public')));

const botName = 'ChatCord Bot';
/*************************/
/*** INTERESTING STUFF ***/
/*************************/
var channels = {};
var sockets = {};

app.get('/', function (req, res) { res.sendFile(__dirname + '/client.html'); });



// Run when client connects
io.on('connection', socket => {
  try {
    socket.on('joinRoom', ({ username, room }) => {
      const user = userJoin(socket.id, username, room);

      socket.join(user.room);

      // Welcome current user
      socket.emit('message', formatMessage(botName, 'Welcome to ChatCord!'));

      // Broadcast when a user connects
      socket.broadcast
        .to(user.room)
        .emit(
          'message',
          formatMessage(botName, `${user.username} has joined the chat`)
        );

      // Send users and room info
      io.to(user.room).emit('roomUsers', {
        room: user.room,
        users: getRoomUsers(user.room)
      });
    });

    // Listen for chatMessage
    socket.on('chatMessage', msg => {
      const user = getCurrentUser(socket.id);

      io.to(user.room).emit('message', formatMessage(user.username, msg));
    });

    // Runs when client disconnects
    socket.on('disconnect', () => {
      const user = userLeave(socket.id);

      if (user) {
        io.to(user.room).emit(
          'message',
          formatMessage(botName, `${user.username} has left the chat`)
        );

        // Send users and room info
        io.to(user.room).emit('roomUsers', {
          room: user.room,
          users: getRoomUsers(user.room)
        });
      }

      for (var channel in socket.channels) {
        part(channel);
      }
      console.log("[" + socket.id + "] disconnected");
      delete sockets[socket.id];
    });

    //webRTC stuff
    socket.channels = {};
    sockets[socket.id] = socket;

    console.log("[" + socket.id + "] connection accepted");

    socket.on('join', function (config) {
      console.log("[" + socket.id + "] join ", config);
      var channel = config.channel;
      var userdata = config.userdata;

      if (channel in socket.channels) {
        console.log("[" + socket.id + "] ERROR: already joined ", channel);
        return;
      }

      if (!(channel in channels)) {
        channels[channel] = {};
      }

      for (id in channels[channel]) {
        channels[channel][id].emit('addPeer', { 'peer_id': socket.id, 'should_create_offer': false });
        socket.emit('addPeer', { 'peer_id': id, 'should_create_offer': true });
      }

      channels[channel][socket.id] = socket;
      socket.channels[channel] = channel;
    });

    function part(channel) {
      console.log("[" + socket.id + "] part ");

      if (!(channel in socket.channels)) {
        console.log("[" + socket.id + "] ERROR: not in ", channel);
        return;
      }

      delete socket.channels[channel];
      delete channels[channel][socket.id];

      for (id in channels[channel]) {
        channels[channel][id].emit('removePeer', { 'peer_id': socket.id });
        socket.emit('removePeer', { 'peer_id': id });
      }
    }
    socket.on('part', part);

    socket.on('relayICECandidate', function (config) {
      var peer_id = config.peer_id;
      var ice_candidate = config.ice_candidate;
      console.log("[" + socket.id + "] relaying ICE candidate to [" + peer_id + "] ", ice_candidate);

      if (peer_id in sockets) {
        sockets[peer_id].emit('iceCandidate', { 'peer_id': socket.id, 'ice_candidate': ice_candidate });
      }
    });

    socket.on('relaySessionDescription', function (config) {
      var peer_id = config.peer_id;
      var session_description = config.session_description;
      console.log("[" + socket.id + "] relaying session description to [" + peer_id + "] ", session_description);

      if (peer_id in sockets) {
        sockets[peer_id].emit('sessionDescription', { 'peer_id': socket.id, 'session_description': session_description });
      }
    });
  } catch (err) {
    console.log("error caught" + err);
  }

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
