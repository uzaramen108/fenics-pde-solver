// config.js - API 설정

(function() {
    'use strict';
    
    const hostname = window.location.hostname;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    
    let apiUrl;
    
    if (isLocal) {
        // 로컬 개발
        const port = window.location.port;
        if (port && port.startsWith('55')) {
            apiUrl = 'http://localhost:8000';  // Docker backend
        } else {
            apiUrl = window.location.origin;   // Nginx proxy
        }
    } else {
        // 프로덕션 (Hugging Face)
        apiUrl = 'https://uzaramen108-fenics-backend.hf.space';
    }
    
    window.APP_CONFIG = {
        API_URL: apiUrl,
        VERSION: '2.0.0',
        DEBUG: isLocal
    };
    
    console.log('🔧 [CONFIG] Environment:', isLocal ? 'development' : 'production');
    console.log('🔧 [CONFIG] API URL:', window.APP_CONFIG.API_URL);
})();