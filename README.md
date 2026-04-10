# Bus Reservation System

A complete bus reservation web app with a C++ core (compiled to WebAssembly), Firebase cloud sync, interactive route map, seat-level booking/cancellation, ticket management, user terminal mode, and admin operations dashboard.

## Tech Stack
- C++17 core logic (`cpp/reservation_system.cpp`)
- WebAssembly build via Emscripten (`dist/reservation.js`, `dist/reservation.wasm`)
- Frontend: HTML/CSS/JavaScript
- Firebase Authentication + Firestore
- Leaflet + OpenStreetMap tiles
- jsPDF (ticket PDF download)

## Core OOP Design (C++)
- `Route` class model (route data, fare, stop list, bus list, path points)
- `Bus` class model (bus code, departure, seat capacity, seat maps)
- `Ticket` class model (ticket data, seats, passengers, status fields)
- `SeatLock` model (temporary lock with expiry)
- `ReservationSystem` controller (booking/cancel/search/reports/admin operations)

## Complete Feature List

### 1) Authentication, Access, and Profile
- Separate Sign In and Create Account tabs
- Email/password account creation and login (Firebase Auth)
- Role-based admin access via Firestore `roles` collection
- Admin tab hidden for non-admin users
- Logout support
- Profile name update
- Password change
- Ticket owner name sync when profile name is changed
- Session configured to avoid auto-login persistence (`inMemoryPersistence`)
- Login allowed only after cloud snapshot is available

### 2) Booking Flow
- Route selection
- Bus service selection
- Travel date selection
- Boarding point selection
- Dropping point selection
- Auto-filter dropping options to only later stops than boarding
- Boarding/dropping validation (`dropping must be after boarding`)
- Past-date booking blocked
- Per-date booking logic (same seat can be free on another date)
- Fare per seat calculated by selected journey segment
- Booking summary card shows:
  - Travel date
  - Boarding/dropping with times
  - Stops covered (including boarding and dropping points)
  - Estimated duration
  - Fare per seat
  - Total for selected seats
- Route info card shows route/service details and total stops on route

### 3) Service Availability Rules
- For today’s date, if selected boarding stop time has passed:
  - Service is marked `Departed`
  - Service becomes non-selectable in dropdown
  - Seat buttons are disabled
  - Booking button is disabled
  - Warning shown in seat section: `Selected service has already departed for today.`
- Any held seats for that departed context are released

### 4) Seat Layout and Seat States
- Fixed 32-seat seater layout
- Driver seat shown at top-right area
- Unique seat numbers, no duplicates
- Seat legend for:
  - Available
  - Selected
  - Temporarily Held
  - Reserved
- Seat status summary above seat map:
  - Available count
  - Selected count
  - Reserved count
- Occupancy bar meter
- Seat selection limit: maximum 5 seats per booking
- Passenger name input required per selected seat

### 5) Real-Time Seat Hold Locking
- Temporary seat hold lock on selection
- Lock stored per `route + bus + travelDate + seat`
- Lock TTL: 120 seconds
- Hold timer shown: `Seats held for MM:SS`
- Auto-clear + lock release when timer expires
- Locks visible to other users as temporarily unavailable
- Lock checks enforced before booking

### 6) Ticketing
- Ticket ID generation (`TKT-xxxxx`)
- Booking confirmation modal before final booking
- Ticket data includes:
  - Route/service
  - Date
  - Boarding/dropping + times
  - Seat numbers
  - Passenger names
  - Fare and fare-per-seat
  - Status
- Statuses:
  - Booked
  - Cancelled
  - Completed
- Completed tickets are non-cancellable
- User cancellation allowed only for own active tickets
- On cancellation, seats are released

### 7) My Tickets (User)
- List only current user’s tickets
- Live search filter (no separate result card)
- Sort by newest/oldest
- Status display per ticket
- Active ticket actions:
  - Print Ticket
  - Download Ticket (PDF)
  - Cancel Ticket
- Cancel/print/download hidden for non-active tickets

### 8) Admin Dashboard

#### A) Tickets Panel
- Live search across ticket id, names, route/service, date, stops, seats
- Cancel active ticket
- Delete ticket record for cancelled/completed tickets
- Bulk clear all cancelled tickets

#### B) Routes Panel
- Edit existing route reference
- Edit fare

#### C) Buses Panel
- Add new bus via popup modal
- Edit bus code
- Edit bus departure time
- Delete bus
- Bus seat capacity forced to 32
- New bus stop timings initialized based on route timing pattern
- If bus departure time changes, stop timings shift by same interval

#### D) Stops Panel
- Edit existing stop name

#### E) Bus Passenger Details Panel
- Filter by route + service + travel date
- Seat-wise passenger manifest view
- Shows ticket/user/boarding/dropping and times
- Export manifest as CSV

#### F) Reports Panel (Unified Operational Report)
- Total bookings
- Total revenue
- Bookings today
- Revenue today
- Cancellation count
- Active ticket count
- Completed trips count
- Most popular route
- Highest revenue route
- Route-wise bookings and revenue table

### 9) Interactive Route Map
- Route displayed on map using route path points
- Start/end stop highlighting
- Stop popups with stop name and service times
- Animated direction flow on route line
- Map auto-fit to route bounds

### 10) User Terminal Mode (Menu-Driven Command Interface)
- User-only terminal (no admin actions)
- Commands:
  - `routes`
  - `services [ROUTE_NO]`
  - `select <ROUTE_NO> [SERVICE_NO]`
  - `status`
  - `date <YYYY-MM-DD>`
  - `stops`
  - `points <BOARD_STOP_NO> <DROP_STOP_NO>`
  - `seats`
  - `book <SEATS_CSV> <NAMES_PIPE>`
  - `tickets`
  - `search <TICKET_ID>`
  - `cancel <TICKET_ID>`
  - `clear`
- Terminal ticket/search/cancel operations are restricted to current user only
- Completed ticket cancellation blocked in terminal too
- Terminal starts at top on first open, then autoscrolls after command output
- Terminal input focus retained while running commands

### 11) Cloud Sync and Data Handling
- Snapshot-based sync to Firestore (`app_state/main`)
- WASM snapshot import/export bridge
- Sync only when data changes (debounced queue + no unnecessary writes)
- Real-time cloud listener to update local app state
- Cloud sync status pill in app header (`Checking / Syncing / Active / Error`)
- Cloud status not shown on login screen
- If cloud snapshot load fails, login session is aborted

### 12) Data Integrity and Validation
- Seat number must be within capacity
- Duplicate seat selection blocked
- Double booking blocked
- Lock conflict handling for concurrent seat selection
- Max 5 seats per booking
- Passenger count must match seat count
- Boarding/dropping sequence validation
- Cancel only if ticket exists and belongs to user (user path)
- Route/bus deletion blocked if ticket history exists
- Bus deletion preserves stop departure alignment by index cleanup
- Completed ticket cancellation blocked
- Admin record deletion allowed only for cancelled/completed tickets

### 13) C++ Persistence
- C++ file persistence (`cpp_state.db`) using snapshot serialization/deserialization
- Export/import snapshot APIs used by frontend for cloud sync

### 14) UI/UX
- Red/white themed responsive interface
- Tab-based layout: Book / Tickets / Admin / Terminal / Profile
- Popup modals for confirmations and actions
- Occupancy bar and seat status counters
- Service departure visual feedback (`Departed`)

## Build (WASM)
Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\build-wasm.ps1
```

This generates:
- `dist/reservation.js`
- `dist/reservation.wasm`

