from http.server import HTTPServer, BaseHTTPRequestHandler


class CORSRequestHandler(BaseHTTPRequestHandler):
    def _set_headers(self, content_type="application/json"):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_OPTIONS(self):
        # Respond to CORS preflight
        self._set_headers()

    def do_POST(self):
        if self.path == "/":
            try:
                with open("payload/stroke.json", "rb") as f:
                    data = f.read()
                self._set_headers()
                self.wfile.write(data)
            except FileNotFoundError:
                self.send_error(404, "stroke.json not found")
        else:
            self.send_error(404, "File not found")

    def do_GET(self):
        if self.path == "/":
            try:
                with open("payload/stroke.json", "rb") as f:
                    data = f.read()
                self._set_headers()
                self.wfile.write(data)
            except FileNotFoundError:
                self.send_error(404, "stroke.json not found")
        else:
            self.send_error(404, "File not found")

def run(server_class=HTTPServer, handler_class=CORSRequestHandler, port=8000):
    server_address = ("0.0.0.0", port)
    httpd = server_class(server_address, handler_class)
    print(
        f"Serving stroke.json on http://localhost:{port}/stroke.json with CORS enabled"
    )
    httpd.serve_forever()


run()
