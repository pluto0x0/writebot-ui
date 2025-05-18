# Handwriting Canvas App

This project is a handwriting canvas application that allows users to write Chinese characters using pressure-sensitive input on devices like the iPad. The application captures the handwritten input, generates thumbnails, and submits the images to a custom API.

## Features

- Supports pressure-sensitive drawing for a natural writing experience.
- Allows users to write Chinese characters and submit their input.
- Captures up to four writing attempts and displays them in a sidebar.
- Generates 128x128 pixel PNG images from the handwritten input and encodes them in base64 format for submission.

## Project Structure

```
handwriting-canvas-app
├── src
│   ├── App.jsx                # Main entry point of the application
│   ├── pages
│   │   └── HandwritingCanvas.jsx  # Component for managing handwriting input
│   ├── components
│   │   ├── CanvasPad.jsx      # Drawing area component
│   │   ├── ThumbnailList.jsx   # Displays thumbnails of written characters
│   │   └── InputField.jsx      # Reusable input field for user text input
│   ├── utils
│   │   └── imageUtils.js       # Utility functions for image processing
│   └── styles
│       └── handwriting.css      # CSS styles for the application
├── package.json                # npm configuration file
└── README.md                   # Project documentation
```

## Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd handwriting-canvas-app
   ```

2. Install the dependencies:
   ```
   npm install
   ```

## Usage

1. Start the application:
   ```
   npm start
   ```

2. Open your browser and navigate to `http://localhost:3000` to access the application.

3. Use the canvas to write characters. You can submit your input after writing.

4. The application will display the characters and their thumbnails in the sidebar.

## API Integration

The application is designed to send the base64 encoded images to a custom API. Ensure that the API endpoint is correctly configured in the application before submitting the images.

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.