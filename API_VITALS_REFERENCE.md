// QUICK API REFERENCE - Remote Monitoring Vitals Endpoints

// ============================================================================
// SAVE VITALS (Blood Pressure, Heart Rate, Temperature, Oxygen)
// ============================================================================
POST /api/vitals
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN

{
  "bloodPressure": "120/80",  // or { systolic: 120, diastolic: 80 }
  "heartRate": 72,             // number in bpm
  "temperature": 98.6,         // number in Fahrenheit
  "oxygenLevel": 98,           // number as percentage
  "weight": 75,                // (optional) in kg
  "symptoms": [                // (optional) array
    {
      "name": "Headache",
      "status": "improving"    // better/improving/same/worse
    }
  ],
  "hydration": 2000,           // (optional) in ml
  "notes": "Feeling good",     // (optional) string
  "source": "manual"           // manual/device/wearable
}

Response: 201 Created
{
  "message": "Vitals recorded successfully",
  "vitals": { ...vitals object... }
}

// ============================================================================
// GET LATEST VITALS
// ============================================================================
GET /api/vitals/latest
Authorization: Bearer YOUR_TOKEN

Response: 200 OK
{
  "vitals": {
    "_id": "...",
    "user": "...",
    "bloodPressure": { "systolic": 120, "diastolic": 80, "raw": "120/80" },
    "heartRate": 72,
    "temperature": 98.6,
    "oxygenLevel": 98,
    "createdAt": "2026-02-18T10:30:00Z"
  }
}

// ============================================================================
// GET ALL VITALS (WITH PAGINATION)
// ============================================================================
GET /api/vitals?limit=50&skip=0
Authorization: Bearer YOUR_TOKEN

Response: 200 OK
{
  "vitals": [ {...}, {...} ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "skip": 0
  }
}

// ============================================================================
// GET DAILY SUMMARY WITH AVERAGES
// ============================================================================
POST /api/vitals/daily-summary
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN

{
  "date": "2026-02-18"  // ISO date string
}

Response: 200 OK
{
  "date": "2026-02-18",
  "count": 4,
  "readings": [ {...}, {...}, {...}, {...} ],
  "averages": {
    "heartRate": 71.5,
    "oxygenLevel": 97.8,
    "temperature": 98.5
  }
}

// ============================================================================
// SHARE VITALS WITH DOCTOR
// ============================================================================
POST /api/vitals/share
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN

{
  "vitalId": "507f1f77bcf86cd799439011",  // vitals reading ID
  "doctorId": "507f1f77bcf86cd799439012"  // doctor user ID
}

Response: 200 OK
{
  "message": "Vitals shared with doctor",
  "vitals": { ...vitals with updated sharedWith array... }
}

// ============================================================================
// UPDATE VITALS READING
// ============================================================================
PUT /api/vitals/507f1f77bcf86cd799439011
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN

{
  "notes": "Updated notes",
  "symptoms": [ { "name": "Cough", "status": "better" } ]
  // only include fields you want to update
}

Response: 200 OK
{
  "message": "Vitals updated successfully",
  "vitals": { ...updated vitals object... }
}

// ============================================================================
// DELETE VITALS READING
// ============================================================================
DELETE /api/vitals/507f1f77bcf86cd799439011
Authorization: Bearer YOUR_TOKEN

Response: 200 OK
{
  "message": "Vitals deleted successfully"
}

// ============================================================================
// FRONTEND USAGE EXAMPLES (React)
// ============================================================================

// Example 1: Save Blood Pressure Reading
const handleLogBloodPressure = async (bp, hr, temp, o2) => {
  try {
    const response = await api.post('/vitals', {
      bloodPressure: bp,      // "120/80"
      heartRate: hr,          // 72
      temperature: temp,      // 98.6
      oxygenLevel: o2,        // 98
      source: 'manual'
    });
    console.log('Saved:', response.data.vitals);
  } catch (error) {
    console.error('Failed to save:', error.response?.data?.message);
  }
};

// Example 2: Load Latest Vitals on Component Mount
useEffect(() => {
  const loadLatestVitals = async () => {
    try {
      const response = await api.get('/vitals/latest');
      setVitals(response.data.vitals);
    } catch (error) {
      console.error('Failed to load vitals:', error);
    }
  };
  loadLatestVitals();
}, []);

// Example 3: Get Day's Summary with Averages
const getDailySummary = async (date) => {
  try {
    const response = await api.post('/vitals/daily-summary', { date });
    console.log('Daily average HR:', response.data.averages.heartRate);
  } catch (error) {
    console.error('Failed to get summary:', error);
  }
};

// Example 4: Track Symptom
const logSymptom = async (symptomName, status) => {
  try {
    await api.post('/vitals', {
      symptoms: [{
        name: symptomName,
        status: status  // 'better', 'improving', 'same', 'worse'
      }],
      source: 'manual'
    });
  } catch (error) {
    console.error('Failed to log symptom:', error);
  }
};

// Example 5: Get All Vitals for Chart/Analysis
const getAllVitals = async () => {
  try {
    const response = await api.get('/vitals?limit=100&skip=0');
    return response.data.vitals; // Array of all vitals
  } catch (error) {
    console.error('Failed to fetch vitals:', error);
    return [];
  }
};

// ============================================================================
// ERROR HANDLING
// ============================================================================

const handleVitalsError = (err) => {
  const message = err.response?.data?.message || err.message;
  switch (err.response?.status) {
    case 400:
      console.error('Validation error:', message);
      break;
    case 401:
      console.error('Unauthorized - please login');
      break;
    case 404:
      console.error('Resource not found:', message);
      break;
    case 500:
      console.error('Server error:', message);
      break;
    default:
      console.error('Unknown error:', message);
  }
};

// ============================================================================
// CURL EXAMPLES FOR TESTING
// ============================================================================

// Save vitals reading
curl -X POST http://localhost:5000/api/vitals \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bloodPressure": "120/80",
    "heartRate": 72,
    "temperature": 98.6,
    "oxygenLevel": 98,
    "source": "manual"
  }'

// Get latest vitals
curl -X GET http://localhost:5000/api/vitals/latest \
  -H "Authorization: Bearer YOUR_TOKEN"

// Get all vitals (paginated)
curl -X GET "http://localhost:5000/api/vitals?limit=50&skip=0" \
  -H "Authorization: Bearer YOUR_TOKEN"

// Get daily summary
curl -X POST http://localhost:5000/api/vitals/daily-summary \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date": "2026-02-18"}'

// Share with doctor
curl -X POST http://localhost:5000/api/vitals/share \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vitalId": "507f1f77bcf86cd799439011",
    "doctorId": "507f1f77bcf86cd799439012"
  }'

// ============================================================================
// RESPONSE STATUS CODES
// ============================================================================

200 OK                  - Request succeeded
201 Created            - Resource successfully created
400 Bad Request        - Invalid input (missing/wrong fields)
401 Unauthorized       - Auth token invalid/missing
403 Forbidden          - User doesn't have permission
404 Not Found          - Vitals/resource doesn't exist
500 Server Error       - Backend error
