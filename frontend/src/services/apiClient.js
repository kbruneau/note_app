import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'http://localhost:4000/api', // Standard API base URL
});

// Request interceptor to add JWT token to headers
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    // Handle request error here
    return Promise.reject(error);
  }
);

export default apiClient;
