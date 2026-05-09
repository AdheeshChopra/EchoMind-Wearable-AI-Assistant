const path = require('path');
try {
  const entry = require.resolve('expo-router/entry', {
    paths: [path.resolve(__dirname, 'node_modules')]
  });
  console.log('Resolved expo-router/entry to:', entry);
} catch (e) {
  console.error('Failed to resolve expo-router/entry:', e.message);
}
