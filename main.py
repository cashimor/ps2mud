import socket

class MMORPGClient:
    def __init__(self, server_ip, server_port, player_name, password):
        self.server_ip = server_ip
        self.server_port = server_port
        self.player_name = player_name
        self.password = password
        self.socket = None
        self.state = 'LOGIN'  # Initial state is 'LOGIN'

    def connect(self):
        """Open a TCP connection to the server."""
        try:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.connect((self.server_ip, self.server_port))
            print(f"Connected to server {self.server_ip}:{self.server_port}")
            # Send login command after connection
            self.send_message(f"login {self.player_name} {self.password}")
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
        """Receive data from the server."""
        try:
            data = self.socket.recv(1024)  # Receive 1024 bytes at a time
            if data:
                return data.decode('utf-8')
        except socket.error as e:
            print(f"Error receiving message: {e}")
        return None

    def process_login(self, response):
        """Handle the login state."""
        if response.startswith('000'):
            print("Login successful!")
            print(f"Server response: {response}")
            self.state = 'GAMEPLAY'  # Transition to gameplay state
        else:
            print(f"Login failed or other response: {response}")

    def process_gameplay(self, response):
        """Handle gameplay-related messages."""
        print(f"Game data received: {response}")
        # Process game data, like room files, commands, etc.

    def run(self):
        """Main loop for the client."""
        if not self.connect():
            return

        while True:
            response = self.receive_message()
            if not response:
                break  # End loop if no response

            if self.state == 'LOGIN':
                self.process_login(response)
            elif self.state == 'GAMEPLAY':
                self.process_gameplay(response)

        self.socket.close()

# Example usage:
if __name__ == "__main__":
    player_name = "player1"  # Replace with actual player name
    password = "password123"  # Replace with actual password
    client = MMORPGClient("mosha.net", 5317, player_name, password)  # Replace with actual server IP and port
    client.run()
