
import { EmergencyRequest } from './types';

/**
 * NOTE FOR 3-LAPTOP SETUP:
 * To make this work across different laptops, replace the BroadcastChannel 
 * logic below with a Firebase Realtime Database reference or Pusher.com.
 * 
 * Current: Works across tabs on one machine.
 * Cloud Upgrade: Use 'firebase/database' and .on('value') for cross-machine.
 */

const CHANNEL_NAME = 'red_connect_global_relay';
const networkChannel = new BroadcastChannel(CHANNEL_NAME);

export type NetworkEvent = 
  | { type: 'GLOBAL_SOS'; payload: { hospitalName: string; location: string; timestamp: string; request: EmergencyRequest } }
  | { type: 'INVENTORY_ALERT'; payload: { bankName: string; bloodType: string; status: string } }
  | { type: 'BROADCAST_MESSAGE'; payload: { from: string; message: string; urgency: 'Normal' | 'Critical' } };

/**
 * Sends a signal out to all other connected instances of the app.
 */
export const broadcastToNetwork = (event: NetworkEvent) => {
  // If using Firebase: firebase.database().ref('events').push(event);
  networkChannel.postMessage(event);
  console.log(`[Cloud Sync] Event Broadcasted: ${event.type}`);
};

/**
 * Sets up a listener that waits for signals from other laptops/tabs.
 */
export const subscribeToNetwork = (callback: (event: NetworkEvent) => void) => {
  const handler = (msg: MessageEvent) => {
    callback(msg.data as NetworkEvent);
  };
  networkChannel.addEventListener('message', handler);
  
  // Return cleanup function
  return () => networkChannel.removeEventListener('message', handler);
};
