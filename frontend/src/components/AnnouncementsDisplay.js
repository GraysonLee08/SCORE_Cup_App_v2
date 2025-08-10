// frontend/src/components/AnnouncementsDisplay.js
// Public announcements display for tournament participants and viewers

import React, { useState, useEffect } from "react";
import { MessageSquare, User } from "lucide-react";
import { fetchAnnouncements } from "../utils/api";

const AnnouncementsDisplay = ({ tournament }) => {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tournament?.id) {
      loadAnnouncements();
      
      // Auto-refresh announcements every 30 seconds
      const interval = setInterval(loadAnnouncements, 30000);
      return () => clearInterval(interval);
    }
  }, [tournament]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAnnouncements = async () => {
    try {
      setLoading(true);
      const response = await fetchAnnouncements(tournament.id);
      setAnnouncements(response.data);
    } catch (error) {
      console.error("Error loading announcements:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  if (!tournament || announcements.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
      <div className="flex items-center space-x-2 mb-4">
        <MessageSquare className="w-5 h-5 text-blue-600" />
        <h2 className="text-lg font-semibold text-gray-900">Latest Announcements</h2>
        {loading && (
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        )}
      </div>
      
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {announcements.slice(0, 5).map((announcement) => (
          <div key={announcement.id} className="border-l-4 border-blue-500 bg-blue-50 p-4 rounded-r-lg">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-medium text-gray-900">{announcement.title}</h3>
              <span className="text-xs text-gray-500">{formatDate(announcement.created_at)}</span>
            </div>
            
            <div className="text-gray-700 text-sm mb-2 whitespace-pre-wrap">
              {announcement.message}
            </div>
            
            <div className="flex items-center space-x-1 text-xs text-gray-500">
              <User className="w-3 h-3" />
              <span>{announcement.created_by}</span>
            </div>
          </div>
        ))}
      </div>
      
      {announcements.length > 5 && (
        <div className="mt-4 text-center text-sm text-gray-500">
          Showing latest 5 of {announcements.length} announcements
        </div>
      )}
    </div>
  );
};

export default AnnouncementsDisplay;