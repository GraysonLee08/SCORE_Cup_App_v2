// frontend/src/components/tabs/AnnouncementsTab.js
// Tournament announcements management for organizers

import React, { useState, useEffect } from "react";
import { MessageSquare, Plus, Trash2, AlertCircle, Clock, User } from "lucide-react";
import { 
  fetchAnnouncements, 
  createAnnouncement, 
  deleteAnnouncement, 
  resetAnnouncements,
  showMessage 
} from "../../utils/api";

const AnnouncementsTab = ({ 
  tournament, 
  loading, 
  setLoading, 
  error, 
  setError, 
  success, 
  setSuccess 
}) => {
  const [announcements, setAnnouncements] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    message: "",
    created_by: "Tournament Admin"
  });

  useEffect(() => {
    if (tournament?.id) {
      loadAnnouncements();
    }
  }, [tournament]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAnnouncements = async () => {
    try {
      setLoading(true);
      const response = await fetchAnnouncements(tournament.id);
      setAnnouncements(response.data);
    } catch (error) {
      console.error("Error loading announcements:", error);
      showMessage(setError, setSuccess, "Failed to load announcements", true);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.title.trim() || !formData.message.trim()) {
      showMessage(setError, setSuccess, "Title and message are required", true);
      return;
    }

    try {
      setLoading(true);
      await createAnnouncement(tournament.id, formData);
      
      setFormData({ title: "", message: "", created_by: "Tournament Admin" });
      setShowForm(false);
      
      await loadAnnouncements();
      showMessage(setError, setSuccess, "Announcement created successfully!");
    } catch (error) {
      console.error("Error creating announcement:", error);
      showMessage(setError, setSuccess, "Failed to create announcement", true);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (announcementId) => {
    if (!window.confirm("Are you sure you want to delete this announcement?")) {
      return;
    }

    try {
      setLoading(true);
      await deleteAnnouncement(announcementId);
      await loadAnnouncements();
      showMessage(setError, setSuccess, "Announcement deleted successfully!");
    } catch (error) {
      console.error("Error deleting announcement:", error);
      showMessage(setError, setSuccess, "Failed to delete announcement", true);
    } finally {
      setLoading(false);
    }
  };

  const handleResetAll = async () => {
    const confirmMessage = `This will delete ALL ${announcements.length} announcements for this tournament. This action cannot be undone. Are you sure?`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      setLoading(true);
      await resetAnnouncements(tournament.id);
      await loadAnnouncements();
      showMessage(setError, setSuccess, "All announcements have been reset!");
    } catch (error) {
      console.error("Error resetting announcements:", error);
      showMessage(setError, setSuccess, "Failed to reset announcements", true);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  if (!tournament) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">No tournament selected. Please create a tournament first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <MessageSquare className="w-6 h-6 text-blue-600" />
          <h2 className="text-2xl font-bold">Tournament Announcements</h2>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => setShowForm(!showForm)}
            disabled={loading}
            className="flex items-center space-x-2 btn btn-primary disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>New Announcement</span>
          </button>
          {announcements.length > 0 && (
            <button
              onClick={handleResetAll}
              disabled={loading}
              className="flex items-center space-x-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span>Reset All</span>
            </button>
          )}
        </div>
      </div>

      {/* Create Announcement Form */}
      {showForm && (
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">Create New Announcement</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Enter announcement title"
                className="w-full"
                disabled={loading}
                maxLength={255}
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Message *
              </label>
              <textarea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="Enter your announcement message"
                rows={4}
                className="w-full"
                disabled={loading}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Posted By
              </label>
              <input
                type="text"
                value={formData.created_by}
                onChange={(e) => setFormData({ ...formData, created_by: e.target.value })}
                placeholder="Your name or role"
                className="w-full"
                disabled={loading}
                maxLength={255}
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                disabled={loading}
                className="btn bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create Announcement"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Announcements List */}
      <div className="space-y-4">
        {announcements.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <MessageSquare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-600 mb-2">No Announcements Yet</h3>
            <p className="text-gray-500">Create your first announcement to communicate with tournament participants.</p>
          </div>
        ) : (
          announcements.map((announcement) => (
            <div key={announcement.id} className="bg-white border rounded-lg p-6 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-xl font-semibold text-gray-900">{announcement.title}</h3>
                <button
                  onClick={() => handleDelete(announcement.id)}
                  disabled={loading}
                  className="text-red-600 hover:text-red-800 disabled:opacity-50"
                  title="Delete announcement"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              
              <div className="text-gray-700 mb-4 whitespace-pre-wrap">
                {announcement.message}
              </div>
              
              <div className="flex items-center space-x-4 text-sm text-gray-500">
                <div className="flex items-center space-x-1">
                  <User className="w-4 h-4" />
                  <span>{announcement.created_by}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Clock className="w-4 h-4" />
                  <span>{formatDate(announcement.created_at)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Summary */}
      {announcements.length > 0 && (
        <div className="tournament-card bg-scores-accent p-4">
          <p className="text-blue-800">
            <strong>{announcements.length}</strong> announcement{announcements.length !== 1 ? 's' : ''} 
            {' '}for <strong>{tournament.name}</strong>
          </p>
        </div>
      )}
    </div>
  );
};

export default AnnouncementsTab;