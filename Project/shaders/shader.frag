#version 300 es

precision mediump float; 

in float u_hue_frag;       // Input hue value passed to the fragment shader
in float u_brightness_frag; // Input brightness value passed to the fragment shader

out vec4 color; // Output color from the fragment shader

// Function to convert HSV (Hue, Saturation, Value) to RGB
vec3 hsv2rgb(float h, float s, float v) {
    float c = v * s; // Chroma, the color intensity
    float x = c * (1.0 - abs(mod(h / 60.0, 2.0) - 1.0)); // Intermediate value to calculate RGB
    float m = v - c; // Adjustment factor for RGB components
    vec3 rgb; // Variable to store RGB color values

    // Determine which sector of the hue the angle falls into, and calculate RGB values accordingly
    if (h < 60.0) {
        rgb = vec3(c, x, 0.0); // Red to yellow
    } else if (h < 120.0) {
        rgb = vec3(x, c, 0.0); // Yellow to green
    } else if (h < 180.0) {
        rgb = vec3(0.0, c, x); // Green to cyan
    } else if (h < 240.0) {
        rgb = vec3(0.0, x, c); // Cyan to blue
    } else if (h < 300.0) {
        rgb = vec3(x, 0.0, c); // Blue to magenta
    } else {
        rgb = vec3(c, 0.0, x); // Magenta to red
    }

    return rgb + vec3(m); // Add the adjustment factor to shift the color intensity
}

void main() {
    vec2 coord = gl_PointCoord; // Get the coordinates of the current fragment within the point

    float dist = distance(coord, vec2(0.5, 0.5)); // Calculate distance from the center of the point

    // If the fragment is within a circle of radius 0.5, apply color; otherwise, discard the fragment
    if (dist < 0.5) {
        // Set the color using the HSV to RGB conversion, applying full saturation and the input brightness
        color = vec4(hsv2rgb(u_hue_frag, 1.0, 1.0), u_brightness_frag); 
    } else {
        discard; // Discard fragments outside the circle
    }
}
