import pygame
from OpenGL.GL import *
from OpenGL.GLU import *

def init_pygame():
    pygame.init()
    display = (800, 600)
    pygame.display.set_mode(display, pygame.DOUBLEBUF | pygame.OPENGL)
    gluPerspective(45, display[0] / display[1], 0.1, 50.0)
    glTranslatef(0.0, 0.0, -5)

def draw_model(model):
    glBegin(GL_TRIANGLES)
    for face in model.faces:
        for vertex in face:
            glVertex3fv(model.vertices[vertex])
    glEnd()

def main():
    init_pygame()

    # Load the MilkShape model
    model = MilkShapeModel("resources/church.txt")

    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False

        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT)

        # Render the model
        draw_model(model)

        pygame.display.flip()
        pygame.time.wait(10)

    pygame.quit()

if __name__ == "__main__":
    main()