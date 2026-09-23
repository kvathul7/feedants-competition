import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from './src/context/AppContext';
import CompetitionDetailsScreen from './src/screens/CompetitionDetailsScreen';

/**
 * Single-screen app by design: the assignment scopes one module, so there is
 * no navigator. The screen is self-contained and drops into a stack unchanged.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <CompetitionDetailsScreen />
      </AppProvider>
    </SafeAreaProvider>
  );
}
