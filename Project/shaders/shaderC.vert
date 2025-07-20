#version 300 es

precision mediump float;
precision mediump int;

// Current index of the point to be drawn
in uint a_index; 

// Define the maximum number of control points
const uint MAX_CONTROL_POINTS = 256u; 
// Array of control points
uniform vec2 u_controlPoints[MAX_CONTROL_POINTS]; 
// Number of segments per section
uniform uint u_numSegmentos;        

// Output the calculated position to the fragment shader
out vec2 v_position; 

// Hue value for color calculations
uniform float u_hue;
out float u_hue_frag; // Pass the hue value to the fragment shader

// brightness value
uniform float u_brightness;
out float u_brightness_frag;

// Size of the point to be rendered
uniform float u_pointSize;

// Function for Catmull-Rom cubic interpolation
vec2 interpolateCatmullRom(vec2 p0, vec2 p1, vec2 p2, vec2 p3, float t) {
  float t2 = t * t; // Calculate t squared
  float t3 = t2 * t; // Calculate t cubed

    // Calculate the interpolated position based on Catmull-Rom formula
  return (1.0f / 2.0f) * ((-t3 + 2.0f * t2 - t) * p0 +
    (3.0f * t3 - 5.0f * t2 + 2.0f) * p1 +
    (-3.0f * t3 + 4.0f * t2 + t) * p2 +
    (t3 - t2) * p3);
}

void main() {
    // Calculate the segment index based on the current index
  uint segmentIndex = a_index / u_numSegmentos;
    // Calculate the interpolation parameter t
  float t = float(a_index % u_numSegmentos) / float(u_numSegmentos);

    // Check if there are enough control points to perform interpolation
  if(segmentIndex + 3u < MAX_CONTROL_POINTS) {
        // Retrieve the control points for the current segment
    vec2 p0 = u_controlPoints[segmentIndex];
    vec2 p1 = u_controlPoints[segmentIndex + 1u];
    vec2 p2 = u_controlPoints[segmentIndex + 2u];
    vec2 p3 = u_controlPoints[segmentIndex + 3u];

        // Interpolate the position using the control points
    v_position = interpolateCatmullRom(p0, p1, p2, p3, t);

        // Set the position of the vertex in clip space
    gl_Position = vec4(v_position, 0.0f, 1.0f);
  } else {
        // Set position to the origin if not enough control points
    gl_Position = vec4(0.0f, 0.0f, 0.0f, 1.0f);
  }

  // Pass the hue value to the fragment shader
  u_hue_frag = u_hue;
  u_brightness_frag = u_brightness;

    // Set the size of the point
  gl_PointSize = u_pointSize;
}