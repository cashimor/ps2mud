
from OpenGL.GL import *
from OpenGL.GLU import *
from milkshape_model import MilkShapeModel

def update_camera(player_position):
    glMatrixMode(GL_MODELVIEW)
    glLoadIdentity()

    # Camera is slightly above and behind the player, looking towards the ground
    cam_x, cam_y, cam_z = player_position[0], player_position[1] + 5, player_position[2] - 10
    gluLookAt(cam_x, cam_y, cam_z, player_position[0], player_position[1], player_position[2], 0, 1, 0)

def draw_scene(objects):
    for obj_name, game_object in objects.items():
        # Position the object in the world
        glPushMatrix()
        glTranslatef(*game_object.position)

        # Render the object (for now, we could just draw cubes as placeholders)
        draw_cube()

        glPopMatrix()