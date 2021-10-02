define(["jquery", "jquery-ui", "xterm", "xterm.fit", "app/container"], function($, a, Terminal, XTERM_FIT, DockerwmContainer) {
    $(function() {
        $(".window").mousedown(function() {
            $(".window").css('z-index', '0')
            $(this).css('z-index', '1000');
        });

        const socket = new WebSocket('ws://localhost:8080/main');

        function send(data) {
            return socket.send(JSON.stringify(data));
        }

        var baseTheme = {
            foreground: '#F8F8F8',
            background: '#2D2E2C',
            selection: '#5DA5D533',
            black: '#1E1E1D',
            brightBlack: '#262625',
            red: '#CE5C5C',
            brightRed: '#FF7272',
            green: '#5BCC5B',
            brightGreen: '#72FF72',
            yellow: '#CCCC5B',
            brightYellow: '#FFFF72',
            blue: '#5D5DD3',
            brightBlue: '#7279FF',
            magenta: '#BC5ED1',
            brightMagenta: '#E572FF',
            cyan: '#5DA5D5',
            brightCyan: '#72F0FF',
            white: '#F8F8F8',
            brightWhite: '#FFFFFF'
        };
        
        var term = new Terminal({
            fontFamily: '"Cascadia Code", Menlo, monospace',
            theme: baseTheme,
            cursorBlink: true
        });

        var containers = {};
        
        function openContainer(id) {
            if(id in containers) {
                // foreground the container
            } else {
                containers[id] = DockerwmContainer(id);
                containers[id].mousedown(function() {
                    $(".window").css('z-index', '0');
                    $(this).css('z-index', '1000');
                });
                containers[id].css('left', '660px');
                containers[id].css('top', '0px');
            }
        }

        window.consoleTerminal = term;

        function installTerm(term) {
            term.prompt = () => {
                term.write('\r\nconsole> ');
            };
            
            term.onData(e => {
                switch (e) {
                    case '\u0003': // Ctrl+C
                        term.write('^C');
                        prompt(term);
                        break;
                    case '\r': // Enter
                        runCommand(term, command);
                        command = '';
                        break;
                    case '\u007F': // Backspace (DEL)
                        // Do not delete the prompt
                        if (term._core.buffer.x > 2) {
                            term.write('\b \b');
                            if (command.length > 0) {
                                command = command.substr(0, command.length - 1);
                            }
                        }
                        break;
                    default: // Print all other characters for demo
                        if (e >= String.fromCharCode(0x20) && e <= String.fromCharCode(0x7B)) {
                            command += e;
                            term.write(e);
                        }
                }
            });

            var containerRegex = new RegExp("container://(.*?)/");
            term.registerLinkMatcher(containerRegex, function(event, uri) {
                console.log(uri);
                openContainer(uri.match(containerRegex)[1]);
            }, {matchIndex: 0})
            
            var command = '';
            var commands = {
                help: {
                    f: () => {
                        term.writeln([
                            'Welcome to xterm.js! Try some of the commands below.',
                            '',
                            ...Object.keys(commands).map(e => `  ${e.padEnd(10)} ${commands[e].description}`)
                        ].join('\n\r'));
                        prompt(term);
                    },
                    description: 'Prints this help message',
                },
                list: {
                    f: () => {
                        send({"cmd": "list"});
                    },
                    description: 'Prints Docker container information'
                },
                container: {
                    f: () => {
                        var splitCommand = command.split(" ");
                        var splitCommand2 = []
                        splitCommand2 = splitCommand.slice(0,3);
                        splitCommand2.push(splitCommand.slice(3).join(' '));
                        // todo: input validation
                        send({"cmd": "container", "data": {"name": splitCommand[1], "image": splitCommand[2], "cmd": splitCommand[3]}});
                    },
                    description: 'Start a new container (container <name> <image> <command>)'
                },
                attach: {
                    f: () => {
                        DockerwmContainer(command.split(" ")[1])
                    },
                    description: 'Attach (attach <id>)'
                },
                image: {
                    f: () => {
                        const splitCommand = command.split(" ", 2);
                        send({"cmd": "image", "image": splitCommand[1]});
                    },
                    description: ""
                }
            };

            function runCommand(term, text) {
                const command = text.trim().split(' ')[0];
                if (command.length > 0) {
                    term.writeln('');
                    if (command in commands) {
                        commands[command].f();
                        return;
                    }
                    term.writeln(`${command}: command not found`);
                }
                prompt(term);
            }

            send({"cmd": "list"});
        }
        
        function prompt(term) {
            command = '';
            term.write('\r\nconsole> ');
        }

        $("#dockerwm-console").draggable({ handle: ".header", containment: "body" });
        $("#dockerwm-console .content").text("Opening main docker WS");

        socket.addEventListener('open', function (event) {
            $("#dockerwm-console .content").text("");
            term.open($("#dockerwm-console .content")[0]);
            term.writeln("Docker WS open");
            XTERM_FIT.fit(term);
            // wait for ready to prompt
        });

        socket.addEventListener('message', function (event) {
            const parsedData = JSON.parse(event.data);

            if(parsedData.cmd == "ready") {
                installTerm(term);
            } else if(parsedData.cmd == "prompt") {
                prompt(term);
            } else if(parsedData.cmd == "container_start") {
                console.log(parsedData.id);
                DockerwmContainer(parsedData.id);
                prompt(term);
            } else if(parsedData.cmd == "image_pull") {
                const imagePullInfo = parsedData.data;

                for(var i = 0; i < imagePullInfo.length; i++) {
                    if("id" in imagePullInfo[i]) {
                        term.write("[" + imagePullInfo[i]["id"] + "] ")
                    }
                    if("status" in imagePullInfo[i]) {
                        term.write(imagePullInfo[i]["status"]);
                    }
                    if("progress" in imagePullInfo[i]) {
                        term.write(imagePullInfo[i]["progress"]);
                    }

                    term.write("\r\n");
                }

                prompt(term);
            } else if(parsedData.cmd == "data") {
                term.write(parsedData.data);
            } else if(parsedData.cmd == "data_b64") {
                term.write(atob(parsedData.data));
            } else if(parsedData.cmd == "list") {
                term.writeln("Images:");
                term.writeln("");

                for(var i = 0; i < parsedData.data.images.length; i++) {
                    term.writeln("Tags: " + parsedData.data.images[i].tags);
                    term.writeln("ID: " + parsedData.data.images[i].id)
                    term.writeln("");
                }

                term.writeln("Containers:");
                term.writeln("");

                for(var i = 0; i < parsedData.data.containers.length; i++) {
                    term.writeln("ID: " + parsedData.data.containers[i].id)
                    term.writeln("container://" + parsedData.data.containers[i].id + "/")
                }
                
                term.writeln("");
            }
        });
    });
});
