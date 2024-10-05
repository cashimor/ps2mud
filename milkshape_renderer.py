import pygame
from OpenGL.GL import *
from OpenGL.GLU import *
from milkshape_model import MilkShapeModel


def init_pygame():
    pygame.init()
    display = (800, 600)
    pygame.display.set_mode(display, pygame.DOUBLEBUF | pygame.OPENGL)

    glEnable(GL_DEPTH_TEST)  # Enable depth testing

    # Set the projection matrix (camera setup)
    glMatrixMode(GL_PROJECTION)
    glLoadIdentity()
    gluPerspective(45, (display[0] / display[1]), 0.1, 50.0)

    # Set the modelview matrix (move camera back)
    glMatrixMode(GL_MODELVIEW)
    glLoadIdentity()
    glTranslatef(0,0,0)  # Adjust the distance to see the model

    # Set the background color
    glClearColor(0.3, 0.3, 0.1, 1)

    # Enable basic lighting
    glEnable(GL_LIGHTING)
    glEnable(GL_LIGHT0)
    glLightfv(GL_LIGHT0, GL_POSITION, (0, 1, 2, 1))  # Light position
    glLightfv(GL_LIGHT0, GL_DIFFUSE, (1.0, 1.0, 1.0, 1.0))  # Light color


def draw_model(model):
    glBegin(GL_TRIANGLES)
    for face in model.faces:
        for i in range(3):
            normal_index = face['normals'][i]
            glNormal3fv(model.normals[normal_index])

            vertex_index = face['vertices'][i]
            glVertex3fv(model.vertices[vertex_index])
    glEnd()


def main():
    init_pygame()

    # Load the MilkShape model
    model = MilkShapeModel("resources\church.txt")

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
