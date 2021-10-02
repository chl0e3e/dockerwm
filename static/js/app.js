requirejs.config({
    "baseUrl": "static/js/lib",
    "paths": {
        "app": "../app",
        "jquery": "jquery-3.6.0",
        "xterm": "xterm.min",
        "xterm.fit": "xterm.fit.min"
    },
    "shim": {
        "jquery-ui": ["jquery"],
        "xterm.fit": ["xterm"]
    }
});

// Load the main app module to start the app
requirejs(["app/main"]);