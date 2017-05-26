
var app = function() {

    var self = {};
    self.is_configured = false;

    var server_url = "https://luca-ucsc-teaching-backend.appspot.com/keystore/";
    var call_interval = 2000;

    Vue.config.silent = false; // show all warnings

    // Extends an array
    self.extend = function(a, b) {
        for (var i = 0; i < b.length; i++) {
            a.push(b[i]);
        }
    };

    self.my_identity = randomString(20);
    self.null_board = [" ", " ", " ", " ", " ", " ", " ", " ", " "];

    // Enumerates an array.
    var enumerate = function(v) {
        var k=0;
        v.map(function(e) {e._idx = k++;});
    };

    // Initializes an attribute of an array of objects.
    var set_array_attribute = function (v, attr, x) {
        v.map(function (e) {e[attr] = x;});
    };

    self.initialize = function () {
        document.addEventListener('deviceready', self.ondeviceready, false);
    };

    self.ondeviceready = function () {
        // This callback is called once Cordova has finished its own initialization.
        console.log("The device is ready");

        $("#vue-div").show();
        self.is_configured = true;
    };

    // This is the object that contains the information coming from the server.
    self.player_x = null;
    self.player_o = null;

    // This is the main control loop.
    function call_server() {
        console.log("Calling the server");
        if (self.vue.chosen_magic_word === null) {
            console.log("No magic word.");
            setTimeout(call_server, call_interval);
        } else {
            // We can do a server call.
            $.ajax({
                dataType: 'json',
                url: server_url +'read',
                data: {key: self.vue.chosen_magic_word},
                success: self.process_server_data,
                complete: setTimeout(call_server, call_interval) // Here we go again.
            });
        }
    }

    // Main function for sending the state.
    self.send_state = function () {
        $.post(server_url + 'store',
            {
                key: self.vue.chosen_magic_word,
                val: JSON.stringify(
                    {
                        'player_x': self.player_x,
                        'player_o': self.player_o,
                        'board': self.vue.board
                    }
                )
            }
        );
    };


    // Main place where we receive data and act on it.
    self.process_server_data = function (data) {
        // If data is null, we send our data.
        if (!data.result) {
            self.player_x = self.my_identity;
            self.player_o = null;
            self.vue.board = self.null_board;
            self.vue.is_my_turn = false;
            self.send_state();
        } else {
            // I technically don't need to assign this to self, but it helps debug the code.
            self.server_answer = JSON.parse(data.result);
            self.player_x = self.server_answer.player_x;
            self.player_o = self.server_answer.player_o;
            if (self.player_x === null || self.player_o === null) {
                // Some player is missing. We cannot play yet.
                self.vue.is_my_turn = false;
                console.log("Not all players present.");
                if (self.player_o === self.my_identity || self.player_x === self.my_identity) {
                    // We are already present, nothing to do.
                    console.log("Waiting for other player to join");
                } else {
                    console.log("Signing up now.");
                    // We are not present.  Let's join if we can.
                    if (self.player_x === null) {
                        // Preferentially we play as x.
                        self.player_x = self.my_identity;
                        self.send_state();
                    } else if (self.player_o === null) {
                        self.player_o = self.my_identity;
                        self.send_state();
                    } else {
                        // The magic word is already taken.
                        self.vue.need_new_magic_word = true;
                    }
                }
            } else {
                console.log("Both players are present");
                // Both players are present.
                // Let us determine our role if any.
                if (self.player_o !== self.my_identity && self.player_x !== self.my_identity) {
                    // Again, we are intruding in a game.
                    self.vue.need_new_magic_word = true;
                } else {
                    // Here is the interesting code: we are playing, and the opponent is there.
                    // Reconciles the state.
                    self.update_local_vars(self.server_answer);
                }
            }
        }
    };

    self.update_local_vars = function (server_answer) {
        // First, figures out our role.
        if (server_answer.player_o === self.my_identity) {
            self.vue.my_role = 'o';
        } else if (server_answer.player_x === self.my_identity) {
            self.vue.my_role = 'x';
        } else {
            self.vue.my_role = ' ';
        }

        // Reconciles the board, and computes whose turn it is.
        for (var i = 0; i < 9; i++) {
            if (self.vue.board[i] === ' ' || server_answer.board[i] !== ' ') {
                // The server has new information for this board.
                Vue.set(self.vue.board, i, server_answer.board[i]);
            } else if (self.vue.board[i] !== server_answer.board[i]
                && self.vue.board[i] !== ' ' && server_answer.board[i] !== ' ')  {
                console.log("Board inconsistency at: " + i);
                console.log("Local:" + self.vue.board[i]);
                console.log("Server:" + server_answer.board[i]);
            }
        }

        // Compute whether it's my turn on the basis of the now reconciled board.
        self.vue.is_my_turn = (self.vue.board !== null) &&
            (self.vue.my_role === whose_turn(self.vue.board));
    };


    function whose_turn(board) {
        num_x = 0;
        num_o = 0;
        for (var i = 0; i < 9; i++) {
            if (board[i] === 'x') num_x += 1;
            if (board[i] === 'o') num_o += 1;
        }
        if (num_o >= num_x) {
            return 'x';
        } else {
            return 'o';
        }
    }


    self.set_magic_word = function () {
        self.vue.chosen_magic_word = self.vue.magic_word;
        self.vue.need_new_magic_word = false;
        // Resets board and turn.
        self.vue.board = self.null_board;
        self.vue.is_my_turn = false;
        self.vue.my_role = "";
    };

    self.play = function (i, j) {
        // Check that the game is ongoing and that it's our turn to play.
        if (!self.vue.is_my_turn) {
            return;
        }
        // Check also that the square is empty.
        if (self.vue.board[i * 3 + j] !== ' ') {
            return;
        }
        // Update self.vue.board.
        Vue.set(self.vue.board, i * 3 + j, self.vue.my_role);
        // We have already played.
        self.vue.is_my_turn = false;
        self.send_state();
    };


    self.vue = new Vue({
        el: "#vue-div",
        delimiters: ['${', '}'],
        unsafeDelimiters: ['!{', '}'],
        data: {
            magic_word: "",
            chosen_magic_word: null,
            need_new_magic_word: false,
            my_role: "",
            board: self.null_board,
            is_other_present: false,
            is_my_turn: false
        },
        methods: {
            set_magic_word: self.set_magic_word,
            play: self.play
        }

    });

    call_server();

    return self;
};

var APP = null;

// This will make everything accessible from the js console;
// for instance, self.x above would be accessible as APP.x
jQuery(function(){
    APP = app();
    APP.initialize();
});
