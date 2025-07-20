// Import necessary utility functions and vector classes from external modules
import { buildProgramFromSources, loadShadersFromURLS, setupWebGL } from "../../libs/utils.js";
import { vec2, vec4 } from "../../libs/MV.js";

/**
 * @author Catarina Padilha <c.padilha@campus.fct.unl.pt>
 * @author Nélio Lacerda <n.lacerda@campus.fct.unl.pt>
 */

// Declare global variables for WebGL context, canvas, aspect ratio, and Vertex Array Object
var gl;
var canvas;
var aspect;
var vao;

// Declare shader programs for different rendering modes
var programBS; // Shader B-Spline
var programB;  // Shader Bézier
var programC;  // Shader Catmull-Rom
var program;   // Currently active shader program

// Initialize configuration variables with default values
let numSegments = 20;           // Number of segments to draw each curve
let speed = 1.0;                // Speed multiplier for animation
let isPaused = true;            // Flag to control pause state
let showLineSegments = true;    // Flag to toggle line segments visibility
let showSamplingPoints = false; // Flag to toggle sampling points visibility
let isCollectingPoints = false; // Flag to control point collection mode
let isBProgram = false;         // Flag to activate Program B
let isCProgram = false;         // Flag to activate Program C
let isSizeCrazy = false;        // Flag to enable size oscillation for points

// Array to store all curves and define maximum control points per curve
let curves = [];
const MAX_CONTROL_POINTS = 256;

// Variables to store the current direction and speed of points
var currentDirection;
var currentPointSpeed;

/**
 * Class representing a single point with position and direction.
 */
class Point {
    /**
     * Creates a new Point instance.
     * @param {vec2} pos - The initial position of the point.
     * @param {vec2} direction - The initial direction of the point.
     */
    constructor(pos, direction) {
        this.pos = pos;
        this.direction = [...direction]; // Clone the direction array to avoid reference issues
    }

    /**
     * Inverts the X direction of the point.
     */
    updateDirectionX() {
        this.direction[0] *= -1;
    }

    /**
     * Inverts the Y direction of the point.
     */
    updateDirectionY() {
        this.direction[1] *= -1;
    }

    /**
     * Updates the X position of the point.
     * @param {number} pos - The amount to add to the current X position.
     */
    setPosX(pos) {
        this.pos[0] += pos;
    }

    /**
     * Updates the Y position of the point.
     * @param {number} pos - The amount to add to the current Y position.
     */
    setPosY(pos) {
        this.pos[1] += pos;
    }
}

/**
 * Class representing a curve composed of multiple points.
 */
class Curve {
    /**
     * Creates a new Curve instance.
     * @param {Point[]} points - Array of Point instances that make up the curve.
     * @param {vec2} velocity - The velocity vector of the curve.
     * @param {number} hue - The initial hue value for coloring the curve.
     * @param {number} brightness - The brightness level of the curve.
     * @param {number} pointSize - The initial size of the points.
     * @param {number} pointSpeed - The speed multiplier for the points.
     */
    constructor(points, velocity, hue, brightness, pointSize, pointSpeed) {
        this.points = points;
        this.velocity = velocity;
        this.hue = hue;
        this.brightness = brightness;
        this.pointSize = pointSize;
        this.pointSpeed = pointSpeed;

        // Properties for point size oscillation
        this.baseSize = pointSize;                  // Base size of the point
        this.sizeAmplitude = Math.random() * 12 + 3; // Random amplitude between 3 and 15
        this.sizeFrequency = Math.random() * 2 + 0.5; // Random frequency between 0.5 and 2.5
        this.sizeTime = 0;                           // Accumulated time for oscillation
    }

    /**
     * Adds a new point to the curve.
     * @param {Point} point - The Point instance to add.
     */
    updatePoints(point) {
        this.points.push(point);
    }

    /**
     * Updates the positions of all points in the curve based on elapsed time.
     * @param {number} elapsedTime - The time elapsed since the last update.
     */
    updatePositions(elapsedTime) {
        // Increment the hue over time for color changes
        this.hue += elapsedTime * 0.1;

        // Reset hue if it exceeds 360 degrees
        if (this.hue > 360) {
            this.hue = 0;
        }

        // Update each point's position and handle boundary collisions
        for (let point of this.points) {

            // Calculate displacement based on individual point's velocity and direction
            const displacementX = ((this.velocity[0] + this.pointSpeed) * point.direction[0] * elapsedTime) * speed;
            const displacementY = ((this.velocity[1] * speed + this.pointSpeed) * point.direction[1] * elapsedTime) * speed;

            // Update the point's position
            point.setPosX(displacementX);
            point.setPosY(displacementY);

            // Check for collision with canvas borders and invert direction if necessary
            if (point.pos[0] > 1 || point.pos[0] < -1) {
                point.updateDirectionX(); // Invert X direction on collision
            }
            if (point.pos[1] > 1 || point.pos[1] < -1) {
                point.updateDirectionY(); // Invert Y direction on collision
            }
        }

        // Update point size based on "crazy" mode flag
        if (isSizeCrazy) {
            this.sizeTime += elapsedTime * 0.001; // Convert elapsed time to seconds
            this.pointSize = this.baseSize + this.sizeAmplitude * Math.sin(this.sizeFrequency * this.sizeTime);
        } else {
            this.pointSize = this.baseSize; // Keep point size constant if not in "crazy" mode
        }
    }

    /**
     * Renders the curve by setting shader uniforms and issuing draw calls.
     */
    draw() {
        // Set the hue uniform for coloring
        const u_hue = gl.getUniformLocation(program, "u_hue");
        gl.uniform1f(u_hue, this.hue);

        // Set the brightness uniform for brightness
        const u_brightness = gl.getUniformLocation(program, "u_brightness");
        gl.uniform1f(u_brightness, this.brightness);

        // Update control point positions in the shader
        for (let i = 0; i < this.points.length; i++) {
            const u_controlPoints = gl.getUniformLocation(program, `u_controlPoints[${i}]`);
            const point = this.points[i];
            const pointPos = vec2(point.pos[0], point.pos[1]);
            gl.uniform2fv(u_controlPoints, pointPos);
        }

        // Only draw if there are enough points to form a curve
        if (this.points.length >= 4) {
            let numPointsToDraw = numSegments * (this.points.length - 3) + 1;
            if(isBProgram){
                let numTrocos = Math.floor((this.points.length - 1) / 3);
                numPointsToDraw = numSegments * numTrocos + 1;
            }
            // Set the number of segments uniform
            const u_numSegmentos = gl.getUniformLocation(program, "u_numSegmentos");
            gl.uniform1ui(u_numSegmentos, numSegments);

            // Draw sampling points if enabled
            if (showSamplingPoints) {
                const u_pointSize = gl.getUniformLocation(program, "u_pointSize");
                gl.uniform1f(u_pointSize, this.pointSize);

                gl.enable(gl.BLEND);
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

                gl.drawArrays(gl.POINTS, 0, numPointsToDraw); // Draw points
            }

            // Draw line segments if enabled
            if (showLineSegments) {
                gl.drawArrays(gl.LINE_STRIP, 0, numPointsToDraw); // Draw lines
            }
        }
    }
}

// Initialize the current curve with default parameters
var currentCurve = newCurve(vec2(0.0, 0.0), 0, 0);

/**
 * Creates a new Curve instance with randomized initial parameters.
 * @param {vec2} velocity - The initial velocity of the curve.
 * @param {number} pointSpeed - The speed multiplier for the points.
 * @returns {Curve} A new Curve instance.
 */
function newCurve(velocity, pointSpeed) {
    return new Curve(
        [],                                     // Start with an empty array of points
        velocity,                               // Set the curve's velocity
        Math.random() * 360,                    // Random hue between 0 and 360
        Math.random(),                           // Random brightness between 0 and 1
        Math.random() * 20.0 + 2.0,             // Random point size between 2 and 22
        pointSpeed                               // Set the point speed
    );
}

/**
 * Updates the information display on the webpage with current settings.
 */
function updateInfoDisplay() {
    document.getElementById('segment-count').textContent = `Segments: ${numSegments}`;
    document.getElementById('speed-display').textContent = `Speed: ${speed.toFixed(1)}x`;
}

/**
 * Generates a random base speed for points.
 * @returns {number} A small random base speed value.
 */
function generateRandomBaseSpeed() {
    return 0.001 * Math.random() + 0.0001;
}

/**
 * Generates a small random perturbation for point direction.
 * @returns {number} A random perturbation value between -0.1 and 0.1.
 */
function generateRandomPerturbation() {
    return (Math.random() - 0.6) * 0.3; // Perturbation between -0.1 and 0.1
}

/**
 * Handles the window resize event to adjust the canvas and viewport.
 * @param {Window} target - The window object that has been resized.
 */
function resize(target) {
    // Acquire the new window dimensions
    const width = target.innerWidth;
    const height = target.innerHeight;

    // Set canvas size to occupy the entire window
    canvas.width = width;
    canvas.height = height;

    // Set the WebGL viewport to fill the canvas completely
    gl.viewport(0, 0, width, height);
}

/**
 * Sets up the WebGL context, compiles shaders, and initializes event handlers.
 * @param {Object} shaders - An object containing compiled shader sources.
 */
function setup(shaders) {
    // Get the canvas element and initialize WebGL context with alpha transparency
    canvas = document.getElementById("gl-canvas");
    gl = setupWebGL(canvas, { alpha: true });

    // Create WebGL shader programs from provided shader sources
    programBS = buildProgramFromSources(gl, shaders["shaderBS.vert"], shaders["shader.frag"]);
    programB = buildProgramFromSources(gl, shaders["shaderB.vert"], shaders["shader.frag"]);
    programC = buildProgramFromSources(gl, shaders["shaderC.vert"], shaders["shader.frag"]);

    // Enable alpha blending for transparency
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Add event listener for window resize to adjust canvas and viewport
    window.addEventListener("resize", (event) => {
        resize(event.target);
    });

    /**
     * Converts mouse event coordinates to WebGL normalized device coordinates.
     * @param {HTMLCanvasElement} canvas - The canvas element.
     * @param {MouseEvent} event - The mouse event.
     * @returns {vec2} A vector containing the normalized X and Y coordinates.
     */
    function get_pos_from_mouse_event(canvas, event) {
        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / canvas.width * 2 - 1;
        const y = -((event.clientY - rect.top) / canvas.height * 2 - 1);
        return vec2(x, y);
    }

    /**
     * Handles mouse down events to collect control points when enabled.
     */
    window.addEventListener("mousedown", (event) => {
        if (event.button === 0 && isCollectingPoints) { // Left mouse button and collecting points
            const pos = get_pos_from_mouse_event(canvas, event);
            console.log(pos); // Log the position for debugging
            const point = new Point(pos, currentDirection); // Create a new point with current direction
            if (currentCurve.points.length < MAX_CONTROL_POINTS) { // Check if maximum control points are not exceeded
                currentCurve.updatePoints(point); // Add the new point to the current curve
            } else {
                console.warn("Maximum number of control points reached."); // Warn if maximum is reached
            }
        }
    });

    /**
     * Handles mouse move events to continuously collect points when enabled and the left button is pressed.
     */
    window.addEventListener("mousemove", (event) => {
        if (event.buttons === 1 && isCollectingPoints) { // Left mouse button is held down and collecting points
            const pos = get_pos_from_mouse_event(canvas, event);
            console.log(pos); // Log the position for debugging
            const point = new Point(pos, currentDirection); // Create a new point with current direction
            if (currentCurve.points.length < MAX_CONTROL_POINTS) { // Check if maximum control points are not exceeded
                currentCurve.updatePoints(point); // Add the new point to the current curve
            } else {
                console.warn("Maximum number of control points reached."); // Warn if maximum is reached
            }
        }
    });

    // Handle mouse up events (currently empty as no action is defined)
    window.addEventListener("mouseup", (event) => {
        // No action defined on mouse up
    });

    /**
     * Handles key down events to control various aspects of the application.
     */
    window.addEventListener("keydown", (event) => {
        switch (event.key) {
            case '+':
                console.log("Plus button pressed");
                numSegments++; // Increase the number of segments
                break;
            case '-':
                console.log("Minus button pressed");
                if (numSegments > 0) {
                    numSegments--; // Decrease the number of segments, ensuring it doesn't go below zero
                }
                break;
            case 'c':
                console.log("C button pressed");
                curves = []; // Clear all existing curves
                currentCurve = newCurve(vec2(0.0, 0.0), 0, 0); // Reset the current curve
                break;
            case '>':
                speed += 0.1; // Increase the animation speed
                console.log("Greater than button pressed");
                break;
            case '<':
                if (speed > 0.1) {
                    speed -= 0.1; // Decrease the animation speed, ensuring it doesn't go below zero
                }
                console.log("Less than button pressed");
                break;
            case ' ':
                isPaused = !isPaused; // Toggle the pause state
                console.log("Spacebar pressed");
                break;
            case 'p':
                showSamplingPoints = !showSamplingPoints; // Toggle the visibility of sampling points
                console.log("P button pressed");
                break;
            case 'l':
                showLineSegments = !showLineSegments; // Toggle the visibility of line segments
                console.log("L button pressed");
                break;
            case 'z':
                console.log("Z button pressed");
                isCollectingPoints = !isCollectingPoints; // Toggle point collection mode
                defineCurve(); // Define a new curve based on current points
                break;
            case 'm':
                isBProgram = !isBProgram; // Toggle Problem B mode
                isCProgram = false;       // Ensure Problem C mode is disabled
                console.log("M button pressed");
                break;
            case 'n':
                isCProgram = !isCProgram; // Toggle Problem C mode
                isBProgram = false;       // Ensure Problem B mode is disabled
                console.log("N button pressed");
                break;
            case 't':
                isSizeCrazy = !isSizeCrazy; // Toggle size oscillation for points
                console.log("T button pressed");
                break;
        }
    });

    // Create an array of indices from 0 to 59999 for buffering
    const index = Array.from({ length: 60000 }, (_, i) => i);
    console.log(index); // Log the index array for debugging

    // Create and bind a buffer for the index data
    const iBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, iBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Uint32Array(index), gl.STATIC_DRAW);

    // Create and bind a Vertex Array Object (VAO)
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // Get the location of the 'a_index' attribute in the shader program
    const a_index = gl.getAttribLocation(programBS, "a_index");
    gl.vertexAttribIPointer(a_index, 1, gl.UNSIGNED_INT, false, 0, 0); // Define the data format for 'a_index'
    gl.enableVertexAttribArray(a_index); // Enable the 'a_index' attribute
    gl.bindVertexArray(null); // Unbind the VAO

    // Adjust the canvas and viewport to the current window size
    resize(window);

    // Set the clear color to black with full opacity
    gl.clearColor(0.0, 0.0, 0.0, 1);

    // Enable alpha blending for transparency
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Start the animation loop
    window.requestAnimationFrame(animate);
}

let last_time; // Variable to store the timestamp of the last frame

/**
 * Defines a new curve by generating random velocity and direction, and adds it to the curves array.
 */
function defineCurve() {
    // Generate a random velocity vector for the new curve
    const velocity = vec2(generateRandomBaseSpeed(), generateRandomBaseSpeed());
    console.log(velocity); // Log the velocity for debugging

    // Generate a random speed multiplier for the points
    currentPointSpeed = generateRandomBaseSpeed();

    // Generate a random direction for the new points
    currentDirection = vec2(generateRandomPerturbation(), generateRandomPerturbation()); // Direction for the points

    console.log("direction: " + currentDirection); // Log the direction for debugging

    // If the current curve has enough points, add it to the curves array
    if (currentCurve.points.length >= 4) {
        curves.push(currentCurve);
    }

    // Create a new current curve with the generated velocity and point speed
    currentCurve = newCurve(velocity, currentPointSpeed);
}

/**
 * The main animation loop that updates and renders the scene.
 * @param {number} timestamp - The current timestamp provided by requestAnimationFrame.
 */
function animate(timestamp) {
    window.requestAnimationFrame(animate); // Request the next frame

    updateInfoDisplay(); // Update the on-screen information display

    const elapsedTime = calculateElapsedTime(timestamp); // Calculate time elapsed since last frame

    gl.clear(gl.COLOR_BUFFER_BIT); // Clear the canvas with the clear color

    program = programBS; // Default to the basic shader program

    // Switch to different shader programs based on problem flags
    if (isBProgram)
        program = programB;
    if (isCProgram)
        program = programC;

    gl.bindVertexArray(vao); // Bind the VAO for drawing

    if (!isPaused) {
        updateCurvesPositions(curves, elapsedTime); // Update positions of all curves if not paused
    }

    gl.useProgram(program); // Use the selected shader program

    drawCurves(curves);      // Draw all existing curves
    drawNewCurve(currentCurve); // Draw the current curve being edited

    gl.useProgram(null);     // Unbind the shader program

    last_time = timestamp;   // Update the last_time for the next frame
}

/**
 * Calculates the elapsed time since the last frame.
 * @param {number} timestamp - The current timestamp provided by requestAnimationFrame.
 * @returns {number} The elapsed time in milliseconds.
 */
function calculateElapsedTime(timestamp) {
    if (last_time === undefined) {
        last_time = timestamp; // Initialize last_time on the first frame
    }
    const elapsed = timestamp - last_time; // Calculate elapsed time
    return elapsed;
}

/**
 * Updates the positions of all curves based on the elapsed time.
 * @param {Curve[]} curves - Array of Curve instances to update.
 * @param {number} elapsedTime - The time elapsed since the last update.
 */
function updateCurvesPositions(curves, elapsedTime) {
    for (let curve of curves) {
        curve.updatePositions(elapsedTime); // Update each curve's positions
    }
}

/**
 * Draws all the curves in the provided array.
 * @param {Curve[]} curves - Array of Curve instances to draw.
 */
function drawCurves(curves) {
    for (let curve of curves) {
        curve.draw(); // Render each curve
    }
}

/**
 * Draws the current curve being edited.
 * @param {Curve} currentCurve - The current Curve instance to draw.
 */
function drawNewCurve(currentCurve) {
    currentCurve.draw(); // Render the current curve
}

// Load shader sources and initialize the WebGL setup
loadShadersFromURLS(["shaderBS.vert", "shaderB.vert", "shaderC.vert", "shader.frag"]).then(shaders => setup(shaders));
