import { StrictMode } from 'react';
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { LocationProvider } from './context/LocationContext';
import { JobProvider } from './context/JobContext';
import { GoogleMapsProvider } from './context/GoogleMapsContext';
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <GoogleMapsProvider>
        <AuthProvider>
          <LocationProvider>
            <JobProvider>
              <App />
            </JobProvider>
          </LocationProvider>
        </AuthProvider>
      </GoogleMapsProvider>
    </ThemeProvider>
  </StrictMode>
);