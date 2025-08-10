// backend/utils/websocket.js
// WebSocket server for real-time tournament updates

const WebSocket = require('ws');
const logger = require('./logger');

class TournamentWebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.clients = new Set();
    this.setupWebSocketServer();
  }

  setupWebSocketServer() {
    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      ws.clientId = clientId;
      this.clients.add(ws);
      
      logger.info('WebSocket client connected', { 
        clientId, 
        totalClients: this.clients.size,
        userAgent: req.headers['user-agent']
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connection',
        message: 'Connected to SCORES Cup Tournament WebSocket',
        clientId,
        timestamp: new Date().toISOString()
      }));

      // Handle client messages
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleClientMessage(ws, data);
        } catch (error) {
          logger.error('Invalid WebSocket message received', error, { clientId });
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format',
            timestamp: new Date().toISOString()
          }));
        }
      });

      // Handle client disconnect
      ws.on('close', (code, reason) => {
        this.clients.delete(ws);
        logger.info('WebSocket client disconnected', { 
          clientId, 
          code,
          reason: reason.toString(),
          totalClients: this.clients.size 
        });
      });

      // Handle client errors
      ws.on('error', (error) => {
        logger.error('WebSocket client error', error, { clientId });
        this.clients.delete(ws);
      });
    });

    logger.info('WebSocket server initialized');
  }

  handleClientMessage(ws, data) {
    const { type, payload } = data;
    
    switch (type) {
      case 'subscribe':
        this.handleSubscription(ws, payload);
        break;
        
      case 'unsubscribe':
        this.handleUnsubscription(ws, payload);
        break;
        
      case 'ping':
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: new Date().toISOString()
        }));
        break;
        
      default:
        logger.warn('Unknown WebSocket message type', { type, clientId: ws.clientId });
    }
  }

  handleSubscription(ws, payload) {
    const { events = [] } = payload;
    
    if (!ws.subscriptions) {
      ws.subscriptions = new Set();
    }
    
    events.forEach(event => ws.subscriptions.add(event));
    
    logger.info('Client subscribed to events', { 
      clientId: ws.clientId, 
      events,
      totalSubscriptions: ws.subscriptions.size 
    });
    
    ws.send(JSON.stringify({
      type: 'subscription_confirmed',
      events,
      timestamp: new Date().toISOString()
    }));
  }

  handleUnsubscription(ws, payload) {
    const { events = [] } = payload;
    
    if (ws.subscriptions) {
      events.forEach(event => ws.subscriptions.delete(event));
    }
    
    logger.info('Client unsubscribed from events', { 
      clientId: ws.clientId, 
      events 
    });
  }

  // Broadcast methods for different tournament events
  broadcastStandingsUpdate(tournamentId, standings) {
    this.broadcast({
      type: 'standings_update',
      tournamentId,
      data: standings,
      timestamp: new Date().toISOString()
    }, ['standings', 'all']);
  }

  broadcastGameResult(tournamentId, gameResult) {
    this.broadcast({
      type: 'game_result',
      tournamentId,
      data: gameResult,
      timestamp: new Date().toISOString()
    }, ['games', 'results', 'all']);
  }

  broadcastScheduleUpdate(tournamentId, schedule) {
    this.broadcast({
      type: 'schedule_update',
      tournamentId,
      data: schedule,
      timestamp: new Date().toISOString()
    }, ['schedule', 'all']);
  }

  broadcastAnnouncement(tournamentId, announcement) {
    this.broadcast({
      type: 'announcement',
      tournamentId,
      data: announcement,
      timestamp: new Date().toISOString()
    }, ['announcements', 'all']);
  }

  broadcastTournamentUpdate(tournamentId, updateType, data) {
    this.broadcast({
      type: 'tournament_update',
      updateType,
      tournamentId,
      data,
      timestamp: new Date().toISOString()
    }, ['tournament', 'all']);
  }

  // Generic broadcast method
  broadcast(message, targetEvents = ['all']) {
    let sentCount = 0;
    const messageString = JSON.stringify(message);
    
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        // Check if client is subscribed to any of the target events
        const shouldSend = !client.subscriptions || 
                          targetEvents.some(event => 
                            client.subscriptions.has(event) || event === 'all'
                          );
        
        if (shouldSend) {
          try {
            client.send(messageString);
            sentCount++;
          } catch (error) {
            logger.error('Failed to send WebSocket message', error, { 
              clientId: client.clientId 
            });
            this.clients.delete(client);
          }
        }
      } else {
        // Remove dead connections
        this.clients.delete(client);
      }
    });
    
    logger.debug('WebSocket message broadcast', { 
      type: message.type, 
      sentCount,
      totalClients: this.clients.size,
      targetEvents 
    });
    
    return sentCount;
  }

  // Send message to specific client
  sendToClient(clientId, message) {
    for (const client of this.clients) {
      if (client.clientId === clientId && client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(message));
          return true;
        } catch (error) {
          logger.error('Failed to send message to specific client', error, { clientId });
          this.clients.delete(client);
          return false;
        }
      }
    }
    return false;
  }

  // Get connection statistics
  getStats() {
    const stats = {
      totalConnections: this.clients.size,
      activeConnections: 0,
      subscriptionStats: {}
    };

    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        stats.activeConnections++;
        
        if (client.subscriptions) {
          client.subscriptions.forEach(sub => {
            stats.subscriptionStats[sub] = (stats.subscriptionStats[sub] || 0) + 1;
          });
        }
      }
    });

    return stats;
  }

  // Cleanup method
  close() {
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.close(1001, 'Server shutting down');
      }
    });
    this.wss.close();
    logger.info('WebSocket server closed');
  }

  generateClientId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}

module.exports = TournamentWebSocketServer;