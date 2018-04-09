let express = require('express');
let app = express();
let mongoose = require('mongoose');
let server = require('http').Server(app);
let io = require('socket.io')(server);
let ss = require('socket.io-stream');

mongoose.connect("mongodb://localhost:27017/csci3280");
let db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
let dbconnected = false;
db.once('open', function(){
    console.log("db connected and opened");
    dbconnected = true;
});

server.listen(8080);

app.use(express.static(__dirname + '/app'));

let ClientSchema = mongoose.Schema({
    client_id: Number
});

let MusicItemSchema = mongoose.Schema({
    name: String,
    author: String,
    owner_id: String
});

app.get( '/', function( req, res) {
    while(!dbconnected){
    }
    console.log("connection build");
});

io.on( 'connection', function( socket ) {
    console.log('New user connected with socket.id: ' + socket.id);
    //all clients in one room for simple
    socket.join(socket.id);
    socket.emit('setID', socket.id);

    socket.emit('build', 'success');

    socket.on('updateClientList', function(musicList){
        console.log("broadcast the client's playlist");
        for(let i in musicList){
            recordMusicIntoDB(musicList[i], socket.id);
        }
        let ns = io.of('/');
        for(let i in ns.connected){
            if(ns.connected[i].id != socket.id){
                ns.connected[i].emit("newMusicList", musicList);
            }
        }
    });

    socket.on('requestMusic', function(musicInfo){
        let name = musicInfo.name;
        let author = musicInfo.author;
        console.log(socket.id + " requests a music named " + name);

        let MusicItemCollection = mongoose.model('MusicItem', MusicItemSchema);
        MusicItemCollection.find(musicInfo, function(err, foundItems){
            if(foundItems.length == 0){
                console.log("not found music in db");
                socket.emit('csci3280_error', 'not found music: ' + musicInfo.name + ' - ' + musicInfo.author);
                return;
            }
            let owner_id = foundItems[0].owner_id;
            console.log("found owner id: " + owner_id);
            let ns = io.of('/');
            let owner_socket = ns.connected[owner_id];
            if(owner_socket == null || typeof owner_socket == typeof undefined){
                console.log("not found owner");
                socket.emit('csci3280_error', 'not found owner');
                return;
            }
            console.log('send request to '+owner_socket.id);
            owner_socket.emit("requestMusicFile", {requestor_id: socket.id, musicInfo: musicInfo});
        });
    });

    //get back the music file from the owner
    ss(socket).on('musicFile', function(incomingstream, data){
        console.log("emmmmm receiving file " + data.filename);
        let requestor_id = data.requestor_id;
        let requestor_socket = io.of('/').connected[requestor_id];
        if(requestor_socket == null || typeof requestor_socket == typeof undefined){
            socket.emit('error', 'requestor not found');
            return;
        }
        let outgoingstream = ss.createStream();
        ss(requestor_socket).emit('musicFile', outgoingstream, data);
        incomingstream.pipe(outgoingstream);
    });

    socket.on('disconnect', function(){
        console.log("Client #"+socket.id+" left");
        let MusicItemCollection = mongoose.model('MusicItem', MusicItemSchema);
        MusicItemCollection.find({owner_id: socket.id}, function(err, foundItems){
            for(let foundItem in foundItems){
                io.emit("deleteMusicItem", {name: foundItem.name, author: foundItem.author});
            }
            MusicItemCollection.remove({owner_id: socket.id}, function(err){
                if (err) console.log(err);
            });
        });
    });
});

function recordMusicIntoDB(musicItem, owner_id){
    let MusicItemCollection = mongoose.model('MusicItem', MusicItemSchema);
    MusicItemCollection.find({name: musicItem.name, author: musicItem.author}, function(err, foundItems){
        if(foundItems.length == 0){
            newMusic = new MusicItemCollection({
                name: musicItem.name,
                author: musicItem.author,
                owner_id: owner_id
            });
            newMusic.save(function(err){
                if(err) console.log(err);
                else console.log('Recorded a new music ' + musicItem.name + ' from ' + owner_id);
            });
        }
    })
}
