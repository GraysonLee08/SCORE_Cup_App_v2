// frontend/src/components/TournamentDashboard.js
// Enhanced tournament dashboard with statistics and analytics

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Trophy, TrendingUp, Target, Users, Calendar, 
  BarChart3, PieChart, Activity, Award, Timer 
} from 'lucide-react';
import { API_URL } from '../utils/api';

const StatCard = ({ title, value, icon: Icon, color = "blue", subtitle, trend }) => (
  <div className={`bg-white rounded-lg border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow`}>
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-sm font-medium text-gray-600 mb-1">{title}</h3>
        <p className={`text-2xl font-bold text-${color}-600`}>{value}</p>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
        {trend && (
          <div className={`flex items-center mt-2 text-sm ${trend.positive ? 'text-green-600' : 'text-red-600'}`}>
            <TrendingUp className={`w-4 h-4 mr-1 ${trend.positive ? '' : 'rotate-180'}`} />
            {trend.value}
          </div>
        )}
      </div>
      <Icon className={`w-8 h-8 text-${color}-500`} />
    </div>
  </div>
);

const PerformerCard = ({ title, items, icon: Icon }) => (
  <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
    <div className="flex items-center mb-4">
      <Icon className="w-5 h-5 text-blue-500 mr-2" />
      <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
    </div>
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={index} className="flex items-center justify-between">
          <span className="text-gray-700">{item.team_name || item.name}</span>
          <span className="font-semibold text-blue-600">
            {typeof item.value === 'number' ? item.value.toFixed(1) : item.total_goals || item.wins || item.goals_conceded || 0}
          </span>
        </div>
      ))}
      {items.length === 0 && (
        <p className="text-gray-500 text-center py-4">No data available</p>
      )}
    </div>
  </div>
);

const PoolAnalyticsCard = ({ pools }) => (
  <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
    <div className="flex items-center mb-4">
      <PieChart className="w-5 h-5 text-purple-500 mr-2" />
      <h3 className="text-lg font-semibold text-gray-800">Pool Analytics</h3>
    </div>
    <div className="space-y-4">
      {pools.map((pool, index) => (
        <div key={index} className="border-l-4 border-purple-500 pl-4 py-2">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-gray-800">{pool.pool_name}</h4>
            <span className="text-sm text-gray-600">{pool.team_count} teams</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Games:</span>
              <span className="ml-1 font-medium">{pool.completed_games}/{pool.total_games}</span>
            </div>
            <div>
              <span className="text-gray-600">Goals/Game:</span>
              <span className="ml-1 font-medium">{pool.avg_goals_per_game}</span>
            </div>
            <div>
              <span className="text-gray-600">Complete:</span>
              <span className="ml-1 font-medium">{pool.completion_percentage}%</span>
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div 
              className="bg-purple-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${pool.completion_percentage}%` }}
            ></div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const TournamentDashboard = ({ tournamentId = 1 }) => {
  const [summary, setSummary] = useState(null);
  const [detailedStandings, setDetailedStandings] = useState([]);
  const [topPerformers, setTopPerformers] = useState({});
  const [gameAnalytics, setGameAnalytics] = useState({});
  const [poolAnalytics, setPoolAnalytics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    fetchDashboardData();
    // Update every 2 minutes
    const interval = setInterval(fetchDashboardData, 120000);
    return () => clearInterval(interval);
  }, [tournamentId]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError('');

      const [
        summaryRes,
        standingsRes,
        performersRes,
        gameAnalyticsRes,
        poolAnalyticsRes
      ] = await Promise.all([
        axios.get(`${API_URL}/api/statistics/tournaments/${tournamentId}/summary`),
        axios.get(`${API_URL}/api/statistics/tournaments/${tournamentId}/standings/detailed`),
        axios.get(`${API_URL}/api/statistics/tournaments/${tournamentId}/top-performers?limit=5`),
        axios.get(`${API_URL}/api/statistics/tournaments/${tournamentId}/analytics/games`),
        axios.get(`${API_URL}/api/statistics/tournaments/${tournamentId}/analytics/pools`)
      ]);

      setSummary(summaryRes.data.data);
      setDetailedStandings(standingsRes.data.data);
      setTopPerformers(performersRes.data.data);
      setGameAnalytics(gameAnalyticsRes.data.data);
      setPoolAnalytics(poolAnalyticsRes.data.data);
      setLastUpdated(new Date());
      
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-600">{error}</p>
        <button 
          onClick={fetchDashboardData}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const getCompletionColor = (percentage) => {
    if (percentage >= 90) return 'green';
    if (percentage >= 70) return 'yellow';
    if (percentage >= 50) return 'orange';
    return 'red';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              {summary?.tournament_name || 'Tournament Dashboard'}
            </h1>
            <p className="text-gray-600">
              {summary?.season} • {summary?.registered_teams} teams registered
            </p>
          </div>
          <div className="text-right text-sm text-gray-500">
            <p>Last updated: {lastUpdated.toLocaleTimeString()}</p>
            <button 
              onClick={fetchDashboardData}
              className="mt-2 px-3 py-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
              disabled={loading}
            >
              {loading ? 'Updating...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Key Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Tournament Progress"
          value={`${summary?.completion_percentage || 0}%`}
          icon={Activity}
          color={getCompletionColor(summary?.completion_percentage || 0)}
          subtitle={`${summary?.completed_games || 0}/${summary?.total_games || 0} games`}
        />
        
        <StatCard
          title="Total Goals"
          value={summary?.total_goals || 0}
          icon={Target}
          color="green"
          subtitle={`${summary?.avg_goals_per_game || 0} per game`}
        />
        
        <StatCard
          title="Active Pools"
          value={summary?.pool_count || 0}
          icon={Users}
          color="purple"
          subtitle={`${summary?.registered_teams || 0} teams total`}
        />
        
        <StatCard
          title="Announcements"
          value={summary?.announcement_count || 0}
          icon={Calendar}
          color="orange"
          subtitle="Tournament updates"
        />
      </div>

      {/* Game Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Average Goals/Game"
          value={gameAnalytics?.avg_goals_per_game || '0.0'}
          icon={BarChart3}
          color="blue"
          subtitle="Tournament average"
        />
        
        <StatCard
          title="Highest Score"
          value={gameAnalytics?.highest_scoring_game || 0}
          icon={Award}
          color="yellow"
          subtitle="Single game total"
        />
        
        <StatCard
          title="Total Draws"
          value={gameAnalytics?.total_draws || 0}
          icon={Timer}
          color="gray"
          subtitle={`${gameAnalytics?.one_goal_games || 0} close games`}
        />
        
        <StatCard
          title="High Scoring"
          value={gameAnalytics?.high_scoring_games || 0}
          icon={TrendingUp}
          color="red"
          subtitle="5+ goal games"
        />
      </div>

      {/* Performance Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <PerformerCard
          title="Top Scorers"
          items={topPerformers?.top_scorers || []}
          icon={Trophy}
        />
        
        <PerformerCard
          title="Best Defense"
          items={(topPerformers?.best_defense || []).map(team => ({
            ...team,
            value: team.goals_conceded
          }))}
          icon={Award}
        />
        
        <PerformerCard
          title="Most Wins"
          items={(topPerformers?.most_wins || []).map(team => ({
            ...team,
            value: team.wins
          }))}
          icon={Target}
        />
      </div>

      {/* Pool Analytics */}
      {poolAnalytics.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PoolAnalyticsCard pools={poolAnalytics} />
          
          {/* Top Teams by Pool */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center mb-4">
              <Trophy className="w-5 h-5 text-gold-500 mr-2" />
              <h3 className="text-lg font-semibold text-gray-800">Pool Leaders</h3>
            </div>
            <div className="space-y-4">
              {poolAnalytics.map((pool, index) => {
                const poolLeader = detailedStandings.find(team => team.pool_id === pool.id);
                return poolLeader ? (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-semibold text-gray-800">{pool.pool_name}</div>
                      <div className="text-sm text-gray-600">{poolLeader.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-blue-600">{poolLeader.points} pts</div>
                      <div className="text-sm text-gray-500">{poolLeader.goals_for}:{poolLeader.goals_against}</div>
                    </div>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TournamentDashboard;