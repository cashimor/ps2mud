import json
import socket
from game_data_handler import GameDataHandler

class MMORPGClient:
    def __init__(self, server_ip, server_port, config_file):
        self.server_ip = server_ip
        self.server_port = server_port
        self.socket = None
        self.state = 'LOGIN'  # Initial state is 'LOGIN'
        self.buffer = ""
        self.data_handler = GameDataHandler()  # Initialize the game data handler
        # Load username and password from config file
        with open(config_file, 'r') as file:
            config = json.load(file)
            self.player_name = config["player_name"]
            self.password = config["password"]

    def connect(self):
        """Open a TCP connection to the server."""
        try:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.connect((self.server_ip, self.server_port))
            print(f"Connected to server {self.server_ip}:{self.server_port}")
            # Send login command after connection
            self.send_message(f"login {self.player_name} {self.password}\n")
        except socket.error as e:
            print(f"Error connecting to server: {e}")
            return False
        return True

    def send_message(self, message):
        """Send a message to the server."""
        try:
            self.socket.sendall(message.encode('utf-8'))
        except socket.error as e:
            print(f"Error sending message: {e}")

    def receive_message(self):
        """Receive data from the server and process it line by line."""
        try:
            data = self.socket.recv(1024).decode('utf-8')  # Receive 1024 bytes at a time
            if data:
                self.buffer += data  # Append data to the buffer
                lines = self.buffer.split("\n")  # Split data by newline
                self.buffer = lines[-1]  # Keep the last incomplete line in the buffer
                return lines[:-1]  # Return all complete lines
        except socket.error as e:
            print(f"Error receiving message: {e}")
        return []

    def process_login(self, response):
        """Handle the login state."""
        print(f"Login data received: {response}")
        if response.startswith('000'):
            print("Login successful!")
            print(f"Server response: {response}")
            self.state = 'GAMEPLAY'  # Transition to gameplay state
        else:
            print(f"Login failed or other response: {response}")

    def process_gameplay(self, response):
        """Forward the game data to the handler."""
        self.data_handler.process_game_data(response)

    def run(self):
        """Main loop for the client."""
        if not self.connect():
            return

        while self.state != 'STOP':
            lines = self.receive_message()
            for line in lines:
                self.process_gameplay(line)

        self.socket.close()

# Example usage:
if __name__ == "__main__":
    client = MMORPGClient("10.0.1.3", 5317, "config.json")  # Replace with actual server IP and port
    client.run()
