class GameDataHandler:
    def __init__(self):
        self.area_description = False  # Track whether we are in an area description

    def process_game_data(self, data):
        """Handle different types of game data."""
        if data.startswith('002'):
            print("Starting area description...")
            self.area_description = True
        elif data.startswith('005'):
            print("Ending area description.")
            self.area_description = False
        elif self.area_description:
            self.process_area_description(data)
        else:
            self.process_other_data(data)

    def process_area_description(self, data):
        """Process the area description data between 002 and 005."""
        if 'NAME' in data:
            print(f"Processing model: {data}")
        elif 'LOCATE' in data:
            print(f"Processing location: {data}")
        elif 'ROTATE' in data:
            print(f"Processing rotation: {data}")
        else:
            print(f"Other area data: {data}")

    def process_other_data(self, data):
        """Handle game data that is not part of the area description."""
        if 'MUSIC' in data:
            print(f"Processing music command: {data}")
        elif 'HP' in data:
            print(f"Processing health data: {data}")
        else:
            print(f"General game data: {data}")
