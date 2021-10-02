define(["jquery", "jquery-ui", "xterm", "xterm.fit"], function($, a, Terminal, XTERM_FIT) {
    return function(containerID) {
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

        function installTerm(term) {
            term.onData(e => {
                send({"cmd": "data_b64", "data": btoa(e)});
            });

            term.addCsiHandler("t", function(params){
                const ps = params[0];
                switch (ps) {
                case 4:
                    term.resize(params[1], params[2]);
                    console.log("CSI handler 4 fired")
                    return true;   // signal Ps=XY was handled
                }
                return false;      // any Ps that was not handled
              });

            send({"cmd": "attach", "id": containerID});
        }

        var containerTemplate = $("#dockerwm-container-template").clone();
        containerTemplate.attr('id', 'container-' + containerID);
        containerTemplate.find('.header').text(containerID);
        containerTemplate.find('.content').text("Attaching to " + containerID);
        $("body").append(containerTemplate);
        $("#container-" + containerID).draggable({ handle: ".header", containment: "body" });

        socket.addEventListener('open', function (event) {
            containerTemplate.find('.content').text("");
            term.open($("#container-" + containerID + " .content")[0]);
            term.writeln("Docker WS open");
            XTERM_FIT.fit(term);
            // wait for ready to attach
        });

        socket.addEventListener('message', function (event) {
            console.log(event.data);
            const parsedData = JSON.parse(event.data);
            if(parsedData.cmd == "ready") {
                installTerm(term);
            } else if(parsedData.cmd == "attached") {
                //send({"cmd": "data", "data": "\x1b[8;" + term.rows + ";" + term.cols + "t"});
            } else if(parsedData.cmd == "data") {
                term.write(parsedData.data);
            } else if(parsedData.cmd == "data_b64") {
                term.write(atob(parsedData.data));
            }
        });

        return $("#container-" + containerID);
    };
});