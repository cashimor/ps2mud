class MilkShapeModel:
    def __init__(self, filename):
        self.vertices = []
        self.faces = []
        self.load_model(filename)

    def load_model(self, filename):
        with open(filename, 'r') as file:
            lines = file.readlines()

        parsing_vertices = False
        parsing_faces = False

        for line in lines:
            line = line.strip()

            if line.startswith("Meshes:"):
                parsing_vertices = True
            elif line.startswith("Frames:"):
                parsing_vertices = False

            if parsing_vertices and line.startswith("0"):
                parts = line.split()
                vertex = [float(parts[1]), float(parts[2]), float(parts[3])]
                self.vertices.append(vertex)
            elif parsing_faces and line.startswith("3"):
                parts = line.split()
                face = [int(parts[1]), int(parts[2]), int(parts[3])]
                self.faces.append(face)