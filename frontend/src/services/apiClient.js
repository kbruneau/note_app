import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'http://localhost:4000/api', // Standard API base URL
  // Future enhancements could include timeout, headers, interceptors, etc.
});

export default apiClient;
