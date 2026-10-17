class MilkShapeModel:
    def __init__(self, filename):
        self.vertices = []
        self.texture_coords = []
        self.normals = []
        self.faces = []
        self.load_model(filename)

    def load_model(self, filename):
        with open(filename, 'r') as file:
            lines = file.readlines()

        parsing_vertices = False
        parsing_normals = False
        parsing_faces = False
        vertex_count = 0
        normal_count = 0
        face_count = 0

        for line in lines:
            line = line.strip()

            # Skip "Frames", "Frame", and "Meshes" lines
            if line.startswith("Frames") or line.startswith("Frame") or line.startswith("Meshes"):
                continue

            # Mesh name (skipped for now)
            if line.startswith('"'):
                parsing_vertices = True
                continue

            if parsing_vertices:
                # First line is the number of vertices
                if vertex_count == 0:
                    vertex_count = int(line)
                    continue

                # Parse vertices
                if vertex_count > 0:
                    parts = line.split()
                    vertex = [float(parts[1]), float(parts[2]), float(parts[3])]  # x, y, z
                    texture = [float(parts[4]), float(parts[5])]  # u, v
                    self.vertices.append(vertex)
                    self.texture_coords.append(texture)
                    vertex_count -= 1
                    if vertex_count == 0:
                        parsing_vertices = False
                        parsing_normals = True
                    continue

            if parsing_normals:
                # First line is the number of normals
                if normal_count == 0:
                    normal_count = int(line)
                    continue

                # Parse normals
                if normal_count > 0:
                    parts = line.split()
                    normal = [float(parts[0]), float(parts[1]), float(parts[2])]
                    self.normals.append(normal)
                    normal_count -= 1
                    if normal_count == 0:
                        parsing_normals = False
                        parsing_faces = True
                    continue

            if parsing_faces:
                # First line is the number of triangles
                if face_count == 0:
                    face_count = int(line)
                    continue

                # Parse faces (triangles)
                if face_count > 0:
                    parts = line.split()
                    face = {
                        'vertices': [int(parts[1]), int(parts[2]), int(parts[3])],
                        'normals': [int(parts[4]), int(parts[5]), int(parts[6])]
                    }
                    self.faces.append(face)
                    face_count -= 1
                    continue
