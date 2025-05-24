# writebot-ui

Web UI for WriteBot

## How to Run

Install packages:

```bash
$ npm install
```

Run servers:

```bash 
$ npm run dev
$ node server.cjs # Run socket.io server
```

2 servers should run in parallel.

## How to use Web UI

Page|Path
---|---
G-code Editor (root) | `/`
Writing Pad | `/write`
Picture Cropping & Upload | `/shot`

Run a Dummy Backend Server: `python payload/server.py`. View [this](/payload/stroke.json) file for API sepecifications.

## License

MIT
