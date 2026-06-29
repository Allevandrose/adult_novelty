const mongoose = require('mongoose');
require('dotenv').config();

console.log('Attempting to connect to:', process.env.MONGODB_URI);

mongoose.connect(process.env.MONGODB_URI)
.then(() => {
  console.log('✅ Successfully connected to MongoDB!');
  process.exit(0);
})
.catch((err) => {
  console.error('❌ Failed to connect:', err.message);
  process.exit(1);
});
