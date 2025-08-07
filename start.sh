#!/bin/bash

# Start backend in background
cd backend
npm start &
BACKEND_PID=$!
echo "Backend started with PID: $BACKEND_PID"

# Start frontend dev server
cd ../frontend
npm run preview &
FRONTEND_PID=$!
echo "Frontend started with PID: $FRONTEND_PID"

# Create PID file for easy shutdown
echo "$BACKEND_PID" > ../backend.pid
echo "$FRONTEND_PID" > ../frontend.pid

echo "🚀 Application started!"
echo "🔗 Frontend: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):3000"
echo "🔗 Backend: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):5000"

# Wait for processes
wait
