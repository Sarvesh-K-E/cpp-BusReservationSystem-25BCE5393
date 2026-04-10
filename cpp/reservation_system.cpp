#include <algorithm>
#include <cctype>
#include <chrono>
#include <cmath>
#include <ctime>
#include <fstream>
#include <iomanip>
#include <map>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

#include <emscripten/bind.h>

using namespace emscripten;

namespace {

constexpr int kFixedSeatCapacity = 32;
struct Ticket;
bool isTicketCompleted(const Ticket &t);

std::string escJson(const std::string &s) {
  std::ostringstream o;
  for (char c : s) {
    if (c == '\\' || c == '"')
      o << '\\' << c;
    else if (c == '\n')
      o << "\\n";
    else if (c == '\r')
      o << "\\r";
    else
      o << c;
  }
  return o.str();
}

std::string nowIso() {
  auto n = std::chrono::system_clock::now();
  std::time_t t = std::chrono::system_clock::to_time_t(n);
  std::tm tm{};
#ifdef _WIN32
  localtime_s(&tm, &t);
#else
  localtime_r(&t, &tm);
#endif
  std::ostringstream o;
  o << std::put_time(&tm, "%Y-%m-%dT%H:%M:%S");
  return o.str();
}

std::string todayYmd() {
  auto n = std::chrono::system_clock::now();
  std::time_t t = std::chrono::system_clock::to_time_t(n);
  std::tm tm{};
#ifdef _WIN32
  localtime_s(&tm, &t);
#else
  localtime_r(&t, &tm);
#endif
  std::ostringstream o;
  o << std::put_time(&tm, "%Y-%m-%d");
  return o.str();
}

long long nowEpochSec() {
  using namespace std::chrono;
  return static_cast<long long>(
      duration_cast<seconds>(system_clock::now().time_since_epoch()).count());
}

int currentMinutesOfDay() {
  auto n = std::chrono::system_clock::now();
  std::time_t t = std::chrono::system_clock::to_time_t(n);
  std::tm tm{};
#ifdef _WIN32
  localtime_s(&tm, &t);
#else
  localtime_r(&t, &tm);
#endif
  return tm.tm_hour * 60 + tm.tm_min;
}

bool parseYmd(const std::string &date) {
  if (date.size() != 10)
    return false;
  for (size_t i = 0; i < date.size(); ++i) {
    if (i == 4 || i == 7) {
      if (date[i] != '-')
        return false;
      continue;
    }
    if (!std::isdigit(static_cast<unsigned char>(date[i])))
      return false;
  }
  int y = std::stoi(date.substr(0, 4));
  int m = std::stoi(date.substr(5, 2));
  int d = std::stoi(date.substr(8, 2));
  if (y < 2000 || m < 1 || m > 12 || d < 1 || d > 31)
    return false;
  return true;
}

bool tryParseIntStrict(const std::string &text, int &out) {
  try {
    size_t idx = 0;
    int value = std::stoi(text, &idx);
    if (idx != text.size())
      return false;
    out = value;
    return true;
  } catch (...) {
    return false;
  }
}

bool tryParseDoubleStrict(const std::string &text, double &out) {
  try {
    size_t idx = 0;
    double value = std::stod(text, &idx);
    if (idx != text.size())
      return false;
    out = value;
    return true;
  } catch (...) {
    return false;
  }
}

bool tryParseLongLongStrict(const std::string &text, long long &out) {
  try {
    size_t idx = 0;
    long long value = std::stoll(text, &idx);
    if (idx != text.size())
      return false;
    out = value;
    return true;
  } catch (...) {
    return false;
  }
}

int parseTimeToMinutes(const std::string &text) {
  std::string s;
  s.reserve(text.size());
  for (char c : text) {
    if (c != '\r' && c != '\n')
      s.push_back(c);
  }
  while (!s.empty() && std::isspace(static_cast<unsigned char>(s.back())))
    s.pop_back();
  size_t start = 0;
  while (start < s.size() && std::isspace(static_cast<unsigned char>(s[start])))
    ++start;
  if (start > 0)
    s = s.substr(start);
  if (s.empty())
    return -1;

  auto colon = s.find(':');
  if (colon == std::string::npos || colon == 0 || colon + 1 >= s.size())
    return -1;

  size_t mmPos = colon + 1;
  if (mmPos + 1 >= s.size() || !std::isdigit(static_cast<unsigned char>(s[mmPos])) ||
      !std::isdigit(static_cast<unsigned char>(s[mmPos + 1])))
    return -1;

  int hh = 0;
  try {
    hh = std::stoi(s.substr(0, colon));
  } catch (...) {
    return -1;
  }
  const int mm = (s[mmPos] - '0') * 10 + (s[mmPos + 1] - '0');
  if (mm < 0 || mm > 59)
    return -1;

  size_t suffixPos = mmPos + 2;
  while (suffixPos < s.size() && std::isspace(static_cast<unsigned char>(s[suffixPos])))
    ++suffixPos;

  if (suffixPos >= s.size()) {
    if (hh < 0 || hh > 23)
      return -1;
    return hh * 60 + mm;
  }

  std::string suffix = s.substr(suffixPos);
  for (char &c : suffix)
    c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
  if (suffix != "AM" && suffix != "PM")
    return -1;
  if (hh < 1 || hh > 12)
    return -1;
  if (suffix == "AM") {
    if (hh == 12)
      hh = 0;
  } else if (hh != 12) {
    hh += 12;
  }
  return hh * 60 + mm;
}

std::string escField(const std::string &s) {
  std::string o;
  for (char c : s) {
    if (c == '\\' || c == '|' || c == ',')
      o.push_back('\\');
    if (c == '\n') {
      o.push_back('\\');
      o.push_back('n');
    } else {
      o.push_back(c);
    }
  }
  return o;
}

std::vector<std::string> splitEsc(const std::string &s, char d) {
  std::vector<std::string> out;
  std::string cur;
  bool e = false;
  for (char c : s) {
    if (e) {
      cur.push_back(c == 'n' ? '\n' : c);
      e = false;
      continue;
    }
    if (c == '\\') {
      e = true;
      continue;
    }
    if (c == d) {
      out.push_back(cur);
      cur.clear();
    } else {
      cur.push_back(c);
    }
  }
  out.push_back(cur);
  return out;
}

std::string ok(const std::string &m) {
  return std::string("{\"success\":true,\"message\":\"") + escJson(m) + "\"}";
}
std::string fail(const std::string &m) {
  return std::string("{\"success\":false,\"message\":\"") + escJson(m) + "\"}";
}

struct Stop {
  std::string stopId, name, arrival;
  std::vector<std::string> departures;
  double lat = 0, lon = 0;
};

struct Bus {
  std::string busId, busCode, displayName, departureTime;
  int seatCapacity = kFixedSeatCapacity;
  std::map<int, std::string> seatTicket;
  std::map<int, std::string> seatPassenger;
};

struct Route {
  std::string routeId, ref, from, to, mapRelationId;
  int fare = 0, seatCapacity = kFixedSeatCapacity;
  std::vector<Stop> stops;
  std::vector<std::pair<double, double>> path;
  std::map<std::string, Bus> buses;
};

struct Ticket {
  std::string ticketId, userId, userName, routeId, busId, createdAt;
  std::string travelDate, boardingStopId, boardingStopName, dropStopId,
      dropStopName, boardingTime, dropTime;
  std::vector<int> seats;
  std::vector<std::string> passengerNames;
  int fare = 0;
  int farePerSeat = 0;
  bool cancelled = false;
  std::string toJson() const {
    const bool completed = !cancelled && isTicketCompleted(*this);
    const std::string status =
        cancelled ? "Cancelled" : (completed ? "Completed" : "Booked");
    std::ostringstream o;
    o << "{"
      << "\"ticketId\":\"" << escJson(ticketId) << "\","
      << "\"userId\":\"" << escJson(userId) << "\","
      << "\"userName\":\"" << escJson(userName) << "\","
      << "\"routeId\":\"" << escJson(routeId) << "\","
      << "\"busId\":\"" << escJson(busId) << "\","
      << "\"fare\":" << fare << ","
      << "\"farePerSeat\":" << farePerSeat << ","
      << "\"cancelled\":" << (cancelled ? "true" : "false") << ","
      << "\"completed\":" << (completed ? "true" : "false") << ","
      << "\"status\":\"" << escJson(status) << "\","
      << "\"travelDate\":\"" << escJson(travelDate) << "\","
      << "\"boardingStopId\":\"" << escJson(boardingStopId) << "\","
      << "\"boardingStopName\":\"" << escJson(boardingStopName) << "\","
      << "\"boardingTime\":\"" << escJson(boardingTime) << "\","
      << "\"dropStopId\":\"" << escJson(dropStopId) << "\","
      << "\"dropStopName\":\"" << escJson(dropStopName) << "\","
      << "\"dropTime\":\"" << escJson(dropTime) << "\","
      << "\"createdAt\":\"" << escJson(createdAt) << "\",\"seats\":[";
    for (size_t i = 0; i < seats.size(); ++i) {
      if (i)
        o << ",";
      o << seats[i];
    }
    o << "],\"passengerNames\":[";
    for (size_t i = 0; i < passengerNames.size(); ++i) {
      if (i)
        o << ",";
      o << "\"" << escJson(passengerNames[i]) << "\"";
    }
    o << "]}";
    return o.str();
  }
};

bool isTicketCompleted(const Ticket &t) {
  if (t.cancelled)
    return false;
  if (!parseYmd(t.travelDate))
    return false;
  const std::string today = todayYmd();
  if (t.travelDate < today)
    return true;
  if (t.travelDate > today)
    return false;
  int tripEndMins = parseTimeToMinutes(t.dropTime);
  if (tripEndMins < 0) {
    tripEndMins = parseTimeToMinutes(t.boardingTime);
  }
  if (tripEndMins < 0)
    return false;
  return currentMinutesOfDay() >= tripEndMins;
}

struct SeatLock {
  std::string routeId, busId, travelDate, userId;
  int seat = 0;
  long long expiresAt = 0;
};

class ReservationSystem {
public:
  ReservationSystem() {}

  std::string reset() {
    routes.clear();
    tickets.clear();
    seatLocks.clear();
    logs.clear();
    ticketCounter = 1;
    saveToFiles();
    return ok("System reset.");
  }

  std::string displayRoutesText() {
    menu("1", "Display Routes");
    std::ostringstream o;
    o << "Available Routes\n";
    for (const auto &kv : routes) {
      const Route &r = kv.second;
      o << r.routeId << " [" << r.ref << "] " << r.from << " -> " << r.to
        << " | Fare " << r.fare << " | Buses " << r.buses.size() << "\n";
    }
    logs.push_back(o.str());
    return o.str();
  }

  std::string upsertRoute(const std::string &routeId, const std::string &ref,
                          const std::string &from, const std::string &to,
                          int fare, int seatCapacity,
                          const std::string &mapRelationId) {
    (void)seatCapacity;
    menu("8", "Admin Upsert Route");
    Route &r = routes[routeId];
    r.routeId = routeId;
    r.ref = ref;
    r.from = from;
    r.to = to;
    r.fare = fare;
    r.seatCapacity = kFixedSeatCapacity;
    r.mapRelationId = mapRelationId;
    logs.push_back("[ADMIN] Route upserted: " + routeId);
    saveToFiles();
    return ok("Route saved.");
  }

  std::string deleteRoute(const std::string &routeId) {
    menu("8", "Admin Delete Route");
    auto it = routes.find(routeId);
    if (it == routes.end())
      return fail("Route not found.");
    int refs = 0;
    for (const auto &tk : tickets) {
      if (tk.second.routeId == routeId)
        refs += 1;
    }
    if (refs > 0) {
      return fail("Cannot delete route with existing ticket history. Clear related ticket records first.");
    }
    routes.erase(it);
    for (auto lk = seatLocks.begin(); lk != seatLocks.end();) {
      if (lk->second.routeId == routeId) {
        lk = seatLocks.erase(lk);
      } else {
        ++lk;
      }
    }
    logs.push_back("[ADMIN] Route deleted: " + routeId);
    saveToFiles();
    return ok("Route deleted.");
  }

  std::string upsertBus(const std::string &routeId, const std::string &busId,
                        const std::string &busCode,
                        const std::string &displayName,
                        const std::string &departureTime, int seatCapacity) {
    (void)seatCapacity;
    menu("8", "Admin Upsert Bus");
    auto it = routes.find(routeId);
    if (it == routes.end())
      return fail("Route not found.");
    Bus existing = it->second.buses.count(busId) ? it->second.buses[busId] : Bus{};
    existing.busId = busId;
    existing.busCode = busCode;
    existing.displayName = displayName;
    existing.departureTime = departureTime;
    existing.seatCapacity = kFixedSeatCapacity;
    for (auto s = existing.seatTicket.begin(); s != existing.seatTicket.end();) {
      if (s->first > kFixedSeatCapacity) {
        existing.seatPassenger.erase(s->first);
        s = existing.seatTicket.erase(s);
      } else {
        ++s;
      }
    }
    it->second.buses[busId] = existing;
    logs.push_back("[ADMIN] Bus upserted: " + routeId + "/" + busId);
    saveToFiles();
    return ok("Bus saved.");
  }

  std::string deleteBus(const std::string &routeId, const std::string &busId) {
    menu("8", "Admin Delete Bus");
    auto it = routes.find(routeId);
    if (it == routes.end())
      return fail("Route not found.");
    int refs = 0;
    for (const auto &tk : tickets) {
      if (tk.second.routeId == routeId && tk.second.busId == busId)
        refs += 1;
    }
    if (refs > 0) {
      return fail("Cannot delete bus with existing ticket history. Clear related ticket records first.");
    }
    int busIdx = -1;
    int idx = 0;
    for (const auto &bk : it->second.buses) {
      if (bk.first == busId) {
        busIdx = idx;
        break;
      }
      ++idx;
    }
    auto bi = it->second.buses.find(busId);
    if (bi == it->second.buses.end())
      return fail("Bus not found.");
    if (busIdx >= 0) {
      for (Stop &s : it->second.stops) {
        if (busIdx < static_cast<int>(s.departures.size())) {
          s.departures.erase(s.departures.begin() + busIdx);
        }
      }
    }
    it->second.buses.erase(bi);
    for (auto lk = seatLocks.begin(); lk != seatLocks.end();) {
      if (lk->second.routeId == routeId && lk->second.busId == busId) {
        lk = seatLocks.erase(lk);
      } else {
        ++lk;
      }
    }
    logs.push_back("[ADMIN] Bus deleted: " + routeId + "/" + busId);
    saveToFiles();
    return ok("Bus deleted.");
  }

  std::string upsertStop(const std::string &routeId, const std::string &stopId,
                         const std::string &name, const std::string &arrival,
                         const std::string &departuresCsv, double lat,
                         double lon) {
    menu("8", "Admin Upsert Stop");
    auto it = routes.find(routeId);
    if (it == routes.end())
      return fail("Route not found.");
    Stop s;
    s.stopId = stopId;
    s.name = name;
    s.arrival = arrival;
    s.departures = splitEsc(departuresCsv, ',');
    s.lat = lat;
    s.lon = lon;
    bool updated = false;
    for (Stop &old : it->second.stops) {
      if (old.stopId == stopId) {
        old = s;
        updated = true;
        break;
      }
    }
    if (!updated)
      it->second.stops.push_back(s);
    logs.push_back("[ADMIN] Stop upserted: " + routeId + "/" + stopId);
    saveToFiles();
    return ok("Stop saved.");
  }

  std::string editStop(const std::string &routeId, const std::string &stopId,
                       const std::string &name, const std::string &arrival,
                       const std::string &departuresCsv, double lat,
                       double lon) {
    menu("8", "Admin Edit Stop");
    auto it = routes.find(routeId);
    if (it == routes.end())
      return fail("Route not found.");
    for (Stop &old : it->second.stops) {
      if (old.stopId != stopId)
        continue;
      old.name = name;
      old.arrival = arrival;
      old.departures = splitEsc(departuresCsv, ',');
      old.lat = lat;
      old.lon = lon;
      logs.push_back("[ADMIN] Stop edited: " + routeId + "/" + stopId);
      saveToFiles();
      return ok("Stop updated.");
    }
    return fail("Stop not found. Stop add/remove is disabled.");
  }

  std::string deleteStop(const std::string &routeId, const std::string &stopId) {
    menu("8", "Admin Delete Stop");
    auto it = routes.find(routeId);
    if (it == routes.end())
      return fail("Route not found.");
    auto &stops = it->second.stops;
    auto found =
        std::find_if(stops.begin(), stops.end(),
                     [&](const Stop &s) { return s.stopId == stopId; });
    if (found == stops.end())
      return fail("Stop not found.");
    stops.erase(found);
    logs.push_back("[ADMIN] Stop deleted: " + routeId + "/" + stopId);
    saveToFiles();
    return ok("Stop deleted.");
  }

  std::string clearRoutePath(const std::string &routeId) {
    menu("8", "Admin Clear Route Path");
    auto it = routes.find(routeId);
    if (it == routes.end())
      return fail("Route not found.");
    it->second.path.clear();
    logs.push_back("[ADMIN] Cleared path: " + routeId);
    saveToFiles();
    return ok("Route path cleared.");
  }

  std::string addPathPoint(const std::string &routeId, double lat, double lon) {
    menu("8", "Admin Add Path Point");
    auto it = routes.find(routeId);
    if (it == routes.end())
      return fail("Route not found.");
    if (!it->second.path.empty()) {
      const auto &last = it->second.path.back();
      if (std::fabs(last.first - lat) < 1e-9 && std::fabs(last.second - lon) < 1e-9)
        return ok("Path point already exists.");
    }
    it->second.path.push_back({lat, lon});
    logs.push_back("[ADMIN] Path point added: " + routeId);
    saveToFiles();
    return ok("Path point added.");
  }
  std::string deletePathPoint(const std::string &routeId, int index) {
    menu("8", "Admin Delete Path Point");
    auto it = routes.find(routeId);
    if (it == routes.end())
      return fail("Route not found.");
    if (index < 0 || index >= static_cast<int>(it->second.path.size()))
      return fail("Path point index out of range.");
    it->second.path.erase(it->second.path.begin() + index);
    logs.push_back("[ADMIN] Path point deleted: " + routeId + " #" +
                   std::to_string(index));
    saveToFiles();
    return ok("Path point deleted.");
  }

  std::string bookTicket(const std::string &userId, const std::string &userName,
                         const std::string &routeId, const std::string &busId,
                         const std::string &seatCsv,
                         const std::string &passengerCsv,
                         const std::string &travelDate,
                         const std::string &boardingStopId,
                         const std::string &dropStopId);
  std::string cancelTicket(const std::string &ticketId);
  std::string cancelTicketForUser(const std::string &userId,
                                  const std::string &ticketId);
  std::string deleteTicketRecord(const std::string &ticketId);
  std::string purgeCancelledTickets();
  std::string searchTicket(const std::string &ticketId);
  std::string searchTicketForUser(const std::string &userId,
                                  const std::string &ticketId);
  std::string updateTicketUserNameForUser(const std::string &userId,
                                          const std::string &userName);
  std::string updateTicketPassengers(const std::string &ticketId,
                                     const std::string &passengerCsv);
  std::string routesJson() const;
  std::string seatsJson(const std::string &routeId, const std::string &busId,
                        const std::string &travelDate) const;
  std::string seatsJsonForUser(const std::string &routeId,
                               const std::string &busId,
                               const std::string &travelDate,
                               const std::string &userId) const;
  std::string upsertSeatLocks(const std::string &userId,
                              const std::string &routeId,
                              const std::string &busId,
                              const std::string &travelDate,
                              const std::string &seatCsv, int ttlSeconds);
  std::string releaseSeatLocks(const std::string &userId,
                               const std::string &routeId,
                               const std::string &busId,
                               const std::string &travelDate,
                               const std::string &seatCsv);
  std::string ticketsJson() const;
  std::string revenueReportJson();
  std::string popularRouteJson();
  std::string reportsJson();
  std::string exportSnapshot() const;
  std::string importSnapshot(const std::string &snapshot);
  std::string terminalLog() const;
  void clearTerminal() { logs.clear(); }
  std::string loadFromFilesApi() {
    loadFromFiles();
    return ok("Loaded from C++ files.");
  }

private:
  static std::string lockKey(const std::string &routeId, const std::string &busId,
                             const std::string &travelDate, int seat) {
    return routeId + "|" + busId + "|" + travelDate + "|" + std::to_string(seat);
  }
  void cleanupExpiredLocks() {
    const long long now = nowEpochSec();
    for (auto it = seatLocks.begin(); it != seatLocks.end();) {
      if (it->second.expiresAt <= now) {
        it = seatLocks.erase(it);
      } else {
        ++it;
      }
    }
  }
  std::map<std::string, Route> routes;
  std::map<std::string, Ticket> tickets;
  std::map<std::string, SeatLock> seatLocks;
  int ticketCounter = 1;
  std::vector<std::string> logs;
  const std::string file = "cpp_state.db";

  void menu(const std::string &choice, const std::string &action) {
    std::ostringstream o;
    o << "===== C++ MENU =====\n"
      << "1.Display Routes 2.Book 3.Cancel 4.Search 5.Reports 8.Admin\n"
      << "Selected: " << choice << " | " << action;
    logs.push_back(o.str());
    if (logs.size() > 300)
      logs.erase(logs.begin(), logs.begin() + 100);
  }
  std::string nextTicketId() {
    std::ostringstream o;
    o << "TKT-" << std::setw(5) << std::setfill('0') << ticketCounter++;
    return o.str();
  }
  void saveToFiles() const;
  void loadFromFiles();
};

std::string ReservationSystem::bookTicket(const std::string &userId,
                                          const std::string &userName,
                                          const std::string &routeId,
                                          const std::string &busId,
                                          const std::string &seatCsv,
                                          const std::string &passengerCsv,
                                          const std::string &travelDate,
                                          const std::string &boardingStopId,
                                          const std::string &dropStopId) {
  menu("2", "Book Ticket");
  auto rit = routes.find(routeId);
  if (rit == routes.end())
    return fail("Route not found.");
  Route &route = rit->second;
  auto bit = rit->second.buses.find(busId);
  if (bit == rit->second.buses.end())
    return fail("Bus not found.");
  Bus &bus = bit->second;
  cleanupExpiredLocks();
  if (!parseYmd(travelDate))
    return fail("Travel date must be in YYYY-MM-DD format.");
  const std::string today = todayYmd();
  if (travelDate < today)
    return fail("Previous day booking is not allowed.");
  if (route.stops.size() < 2)
    return fail("Route stop data is insufficient.");

  std::vector<int> seats;
  for (const std::string &s : splitEsc(seatCsv, ',')) {
    if (s.empty())
      continue;
    try {
      seats.push_back(std::stoi(s));
    } catch (...) {
      return fail("Invalid seat list.");
    }
  }
  std::vector<std::string> passengers = splitEsc(passengerCsv, ',');
  if (seats.empty())
    return fail("Select at least one seat.");
  if (seats.size() > 5)
    return fail("Maximum 5 seats per booking.");
  if (passengers.size() != seats.size())
    return fail("Passenger names count must match selected seats.");
  std::sort(seats.begin(), seats.end());
  if (std::adjacent_find(seats.begin(), seats.end()) != seats.end())
    return fail("Duplicate seats are not allowed.");

  for (size_t i = 0; i < seats.size(); ++i) {
    if (seats[i] < 1 || seats[i] > bus.seatCapacity)
      return fail("Seat number out of capacity.");
    if (passengers[i].empty())
      return fail("Passenger name cannot be empty.");
  }
  for (const auto &tk : tickets) {
    const Ticket &existing = tk.second;
    if (existing.cancelled)
      continue;
    if (existing.routeId != routeId || existing.busId != busId ||
        existing.travelDate != travelDate)
      continue;
    for (int chosen : seats) {
      if (std::find(existing.seats.begin(), existing.seats.end(), chosen) !=
          existing.seats.end()) {
        return fail("Seat already booked: " + std::to_string(chosen));
      }
    }
  }
  const long long now = nowEpochSec();
  for (int chosen : seats) {
    const auto lk = seatLocks.find(lockKey(routeId, busId, travelDate, chosen));
    if (lk != seatLocks.end() && lk->second.expiresAt > now &&
        lk->second.userId != userId) {
      return fail("Seat temporarily locked: " + std::to_string(chosen));
    }
  }

  int boardingIdx = -1;
  int dropIdx = -1;
  for (size_t i = 0; i < route.stops.size(); ++i) {
    if (route.stops[i].stopId == boardingStopId)
      boardingIdx = static_cast<int>(i);
    if (route.stops[i].stopId == dropStopId)
      dropIdx = static_cast<int>(i);
  }
  if (boardingIdx < 0 || dropIdx < 0)
    return fail("Invalid boarding or dropping point.");
  if (boardingIdx >= dropIdx)
    return fail("Dropping point must be after boarding point.");

  int busIdx = -1;
  int idx = 0;
  for (const auto &bk : route.buses) {
    if (bk.first == busId) {
      busIdx = idx;
      break;
    }
    ++idx;
  }
  if (busIdx < 0)
    return fail("Bus service index not found.");

  const Stop &boardingStop = route.stops[boardingIdx];
  const Stop &dropStop = route.stops[dropIdx];
  std::string boardingTime = boardingStop.arrival;
  std::string dropTime = dropStop.arrival;
  if (busIdx < static_cast<int>(boardingStop.departures.size()) &&
      !boardingStop.departures[busIdx].empty()) {
    boardingTime = boardingStop.departures[busIdx];
  }
  if (busIdx < static_cast<int>(dropStop.departures.size()) &&
      !dropStop.departures[busIdx].empty()) {
    dropTime = dropStop.departures[busIdx];
  }
  const int boardingMins = parseTimeToMinutes(boardingTime);
  if (travelDate == today && boardingMins >= 0 &&
      currentMinutesOfDay() >= boardingMins) {
    return fail("Selected boarding time has already passed for today.");
  }

  const int maxFare = std::max(1, route.fare);
  const int minFare = std::max(1, static_cast<int>(std::ceil(maxFare * 0.5)));
  const int totalSegments = std::max(1, static_cast<int>(route.stops.size()) - 1);
  const int chosenSegments = dropIdx - boardingIdx;
  const double ratio =
      std::max(0.0, std::min(1.0, chosenSegments / static_cast<double>(totalSegments)));
  int farePerSeat = minFare +
                    static_cast<int>(std::round((maxFare - minFare) * ratio));
  farePerSeat = std::max(minFare, std::min(maxFare, farePerSeat));

  const std::string ticketId = nextTicketId();
  Ticket t;
  t.ticketId = ticketId;
  t.userId = userId;
  t.userName = userName;
  t.routeId = routeId;
  t.busId = busId;
  t.travelDate = travelDate;
  t.boardingStopId = boardingStop.stopId;
  t.boardingStopName = boardingStop.name;
  t.boardingTime = boardingTime;
  t.dropStopId = dropStop.stopId;
  t.dropStopName = dropStop.name;
  t.dropTime = dropTime;
  t.seats = seats;
  t.passengerNames = passengers;
  t.farePerSeat = farePerSeat;
  t.fare = static_cast<int>(seats.size()) * farePerSeat;
  t.createdAt = nowIso();
  tickets[ticketId] = t;
  for (int seat : seats) {
    seatLocks.erase(lockKey(routeId, busId, travelDate, seat));
  }
  saveToFiles();
  logs.push_back("[BOOK] Ticket created " + ticketId);
  return std::string("{\"success\":true,\"message\":\"Ticket booked\",\"ticket\":") +
         t.toJson() + "}";
}

std::string ReservationSystem::cancelTicket(const std::string &ticketId) {
  menu("3", "Cancel Ticket");
  auto it = tickets.find(ticketId);
  if (it == tickets.end())
    return fail("TicketID not found.");
  Ticket &t = it->second;
  if (t.cancelled)
    return fail("Ticket already cancelled.");
  if (isTicketCompleted(t))
    return fail("Completed ticket cannot be cancelled.");
  auto rit = routes.find(t.routeId);
  if (rit == routes.end())
    return fail("Route missing.");
  auto bit = rit->second.buses.find(t.busId);
  if (bit == rit->second.buses.end())
    return fail("Bus missing.");
  t.cancelled = true;
  saveToFiles();
  logs.push_back("[CANCEL] Ticket cancelled for " + ticketId);
  return ok("Ticket cancelled and seats released.");
}

std::string ReservationSystem::cancelTicketForUser(const std::string &userId,
                                                   const std::string &ticketId) {
  auto it = tickets.find(ticketId);
  if (it == tickets.end())
    return fail("Ticket not found.");
  if (it->second.userId != userId)
    return fail("Ticket not found.");
  return cancelTicket(ticketId);
}

std::string ReservationSystem::deleteTicketRecord(const std::string &ticketId) {
  menu("8", "Admin Clear Ticket Record");
  auto it = tickets.find(ticketId);
  if (it == tickets.end())
    return fail("Ticket not found.");
  if (!it->second.cancelled && !isTicketCompleted(it->second))
    return fail("Only cancelled or completed tickets can be cleared.");
  tickets.erase(it);
  logs.push_back("[ADMIN] Ticket record cleared: " + ticketId);
  saveToFiles();
  return ok("Cancelled ticket record cleared.");
}

std::string ReservationSystem::purgeCancelledTickets() {
  menu("8", "Admin Purge Cancelled Ticket Records");
  int removed = 0;
  for (auto it = tickets.begin(); it != tickets.end();) {
    if (!it->second.cancelled) {
      ++it;
      continue;
    }
    it = tickets.erase(it);
    ++removed;
  }
  logs.push_back("[ADMIN] Cancelled ticket records purged: " +
                 std::to_string(removed));
  saveToFiles();
  return ok("Purged cancelled ticket records: " + std::to_string(removed));
}

std::string ReservationSystem::searchTicket(const std::string &ticketId) {
  menu("4", "Search Ticket");
  auto it = tickets.find(ticketId);
  if (it == tickets.end())
    return fail("Ticket not found.");
  return std::string("{\"success\":true,\"ticket\":") + it->second.toJson() + "}";
}

std::string ReservationSystem::searchTicketForUser(const std::string &userId,
                                                   const std::string &ticketId) {
  auto it = tickets.find(ticketId);
  if (it == tickets.end())
    return fail("Ticket not found.");
  if (it->second.userId != userId)
    return fail("Ticket not found.");
  return searchTicket(ticketId);
}

std::string ReservationSystem::updateTicketUserNameForUser(
    const std::string &userId, const std::string &userName) {
  menu("8", "User Update Ticket Display Name");
  if (userId.empty())
    return fail("User ID missing.");
  if (userName.empty())
    return fail("User name cannot be empty.");
  int changed = 0;
  for (auto &kv : tickets) {
    Ticket &t = kv.second;
    if (t.userId != userId)
      continue;
    if (t.userName == userName)
      continue;
    t.userName = userName;
    ++changed;
  }
  if (changed > 0) {
    saveToFiles();
    logs.push_back("[USER] Updated ticket names for user: " + userId + " (" +
                   std::to_string(changed) + ")");
  }
  return ok("Updated ticket records: " + std::to_string(changed));
}

std::string ReservationSystem::updateTicketPassengers(
    const std::string &ticketId, const std::string &passengerCsv) {
  menu("8", "Admin Update Ticket Passengers");
  auto it = tickets.find(ticketId);
  if (it == tickets.end())
    return fail("Ticket not found.");
  if (it->second.cancelled)
    return fail("Ticket is cancelled.");
  std::vector<std::string> p = splitEsc(passengerCsv, ',');
  if (p.size() != it->second.seats.size())
    return fail("Passenger count mismatch.");
  for (const std::string &name : p) {
    if (name.empty())
      return fail("Passenger names cannot be empty.");
  }
  it->second.passengerNames = p;
  logs.push_back("[ADMIN] Ticket passenger update: " + ticketId);
  saveToFiles();
  return ok("Ticket passenger details updated.");
}

std::string ReservationSystem::routesJson() const {
  std::ostringstream o;
  o << "{\"success\":true,\"routes\":[";
  size_t ri = 0;
  for (const auto &rk : routes) {
    if (ri++)
      o << ",";
    const Route &r = rk.second;
    o << "{"
      << "\"routeId\":\"" << escJson(r.routeId) << "\","
      << "\"ref\":\"" << escJson(r.ref) << "\","
      << "\"from\":\"" << escJson(r.from) << "\","
      << "\"to\":\"" << escJson(r.to) << "\","
      << "\"fare\":" << r.fare << ","
      << "\"seatCapacity\":" << r.seatCapacity << ",\"buses\":[";
    size_t bi = 0;
    for (const auto &bk : r.buses) {
      if (bi++)
        o << ",";
      const Bus &b = bk.second;
      o << "{"
        << "\"busId\":\"" << escJson(b.busId) << "\","
        << "\"busCode\":\"" << escJson(b.busCode) << "\","
        << "\"displayName\":\"" << escJson(b.displayName) << "\","
        << "\"departureTime\":\"" << escJson(b.departureTime) << "\","
        << "\"seatCapacity\":" << b.seatCapacity << "}";
    }
    o << "],\"stops\":[";
    for (size_t si = 0; si < r.stops.size(); ++si) {
      if (si)
        o << ",";
      const Stop &s = r.stops[si];
      o << "{"
        << "\"stopId\":\"" << escJson(s.stopId) << "\","
        << "\"name\":\"" << escJson(s.name) << "\","
        << "\"arrival\":\"" << escJson(s.arrival) << "\","
        << "\"lat\":" << s.lat << ",\"lon\":" << s.lon << ",\"departures\":[";
      for (size_t di = 0; di < s.departures.size(); ++di) {
        if (di)
          o << ",";
        o << "\"" << escJson(s.departures[di]) << "\"";
      }
      o << "]}";
    }
    o << "],\"path\":[";
    for (size_t pi = 0; pi < r.path.size(); ++pi) {
      if (pi)
        o << ",";
      o << "[" << r.path[pi].first << "," << r.path[pi].second << "]";
    }
    o << "]}";
  }
  o << "]}";
  return o.str();
}

std::string ReservationSystem::seatsJson(const std::string &routeId,
                                         const std::string &busId,
                                         const std::string &travelDate) const {
  return seatsJsonForUser(routeId, busId, travelDate, "");
}

std::string ReservationSystem::seatsJsonForUser(const std::string &routeId,
                                                const std::string &busId,
                                                const std::string &travelDate,
                                                const std::string &userId) const {
  auto rit = routes.find(routeId);
  if (rit == routes.end())
    return fail("Route not found.");
  auto bit = rit->second.buses.find(busId);
  if (bit == rit->second.buses.end())
    return fail("Bus not found.");
  if (!parseYmd(travelDate))
    return fail("Travel date must be in YYYY-MM-DD format.");
  const Bus &b = bit->second;
  const long long now = nowEpochSec();
  std::map<int, std::string> seatTicket;
  std::map<int, std::string> seatPassenger;
  std::map<int, SeatLock> activeLocks;
  for (const auto &kv : tickets) {
    const Ticket &t = kv.second;
    if (t.cancelled)
      continue;
    if (t.routeId != routeId || t.busId != busId || t.travelDate != travelDate)
      continue;
    for (size_t i = 0; i < t.seats.size(); ++i) {
      const int seat = t.seats[i];
      if (seat < 1 || seat > b.seatCapacity)
        continue;
      seatTicket[seat] = t.ticketId;
      seatPassenger[seat] =
          i < t.passengerNames.size() ? t.passengerNames[i] : "";
    }
  }
  for (const auto &lkv : seatLocks) {
    const SeatLock &lk = lkv.second;
    if (lk.routeId != routeId || lk.busId != busId || lk.travelDate != travelDate)
      continue;
    if (lk.expiresAt <= now)
      continue;
    if (lk.seat < 1 || lk.seat > b.seatCapacity)
      continue;
    activeLocks[lk.seat] = lk;
  }
  std::ostringstream o;
  o << "{\"success\":true,\"seatCapacity\":" << b.seatCapacity << ",\"seats\":[";
  for (int seat = 1; seat <= b.seatCapacity; ++seat) {
    if (seat > 1)
      o << ",";
    const auto itT = seatTicket.find(seat);
    const auto itP = seatPassenger.find(seat);
    const auto itL = activeLocks.find(seat);
    const bool isBooked = itT != seatTicket.end();
    const bool isLocked = !isBooked && itL != activeLocks.end();
    const bool isLockedByYou =
        isLocked && !userId.empty() && itL->second.userId == userId;
    const bool isLockedByOther = isLocked && !isLockedByYou;
    o << "{"
      << "\"seat\":" << seat << ","
      << "\"booked\":" << (isBooked ? "true" : "false") << ","
      << "\"locked\":" << (isLocked ? "true" : "false") << ","
      << "\"lockedByYou\":" << (isLockedByYou ? "true" : "false") << ","
      << "\"lockedByOther\":" << (isLockedByOther ? "true" : "false") << ","
      << "\"lockExpiry\":" << (isLocked ? itL->second.expiresAt : 0) << ","
      << "\"ticketId\":\"" << (itT == seatTicket.end() ? "" : escJson(itT->second))
      << "\","
      << "\"passenger\":\""
      << (itP == seatPassenger.end() ? "" : escJson(itP->second)) << "\"}";
  }
  o << "]}";
  return o.str();
}

std::string ReservationSystem::upsertSeatLocks(const std::string &userId,
                                               const std::string &routeId,
                                               const std::string &busId,
                                               const std::string &travelDate,
                                               const std::string &seatCsv,
                                               int ttlSeconds) {
  if (userId.empty())
    return fail("User not authenticated.");
  auto rit = routes.find(routeId);
  if (rit == routes.end())
    return fail("Route not found.");
  auto bit = rit->second.buses.find(busId);
  if (bit == rit->second.buses.end())
    return fail("Bus not found.");
  if (!parseYmd(travelDate))
    return fail("Travel date must be in YYYY-MM-DD format.");
  cleanupExpiredLocks();
  const Bus &bus = bit->second;
  std::vector<int> seats;
  for (const std::string &s : splitEsc(seatCsv, ',')) {
    if (s.empty())
      continue;
    int seat = 0;
    if (!tryParseIntStrict(s, seat))
      return fail("Invalid seat list.");
    seats.push_back(seat);
  }
  std::sort(seats.begin(), seats.end());
  if (std::adjacent_find(seats.begin(), seats.end()) != seats.end())
    return fail("Duplicate seats are not allowed.");
  if (seats.size() > 5)
    return fail("Maximum 5 seats per booking.");
  for (int seat : seats) {
    if (seat < 1 || seat > bus.seatCapacity)
      return fail("Seat number out of capacity.");
  }
  for (const auto &tk : tickets) {
    const Ticket &existing = tk.second;
    if (existing.cancelled)
      continue;
    if (existing.routeId != routeId || existing.busId != busId ||
        existing.travelDate != travelDate)
      continue;
    for (int chosen : seats) {
      if (std::find(existing.seats.begin(), existing.seats.end(), chosen) !=
          existing.seats.end()) {
        return fail("Seat already booked: " + std::to_string(chosen));
      }
    }
  }

  const long long now = nowEpochSec();
  for (int seat : seats) {
    const auto it = seatLocks.find(lockKey(routeId, busId, travelDate, seat));
    if (it != seatLocks.end() && it->second.expiresAt > now &&
        it->second.userId != userId) {
      return fail("Seat temporarily locked: " + std::to_string(seat));
    }
  }

  const int ttl = std::max(30, std::min(300, ttlSeconds <= 0 ? 120 : ttlSeconds));
  const long long expiry = now + ttl;

  std::map<int, bool> keep;
  for (int seat : seats)
    keep[seat] = true;
  for (auto it = seatLocks.begin(); it != seatLocks.end();) {
    const SeatLock &lk = it->second;
    if (lk.routeId == routeId && lk.busId == busId && lk.travelDate == travelDate &&
        lk.userId == userId) {
      if (keep.find(lk.seat) == keep.end()) {
        it = seatLocks.erase(it);
        continue;
      }
    }
    ++it;
  }
  for (int seat : seats) {
    SeatLock lk;
    lk.routeId = routeId;
    lk.busId = busId;
    lk.travelDate = travelDate;
    lk.seat = seat;
    lk.userId = userId;
    lk.expiresAt = expiry;
    seatLocks[lockKey(routeId, busId, travelDate, seat)] = lk;
  }
  saveToFiles();
  std::ostringstream o;
  o << "{\"success\":true,\"message\":\"Seat locks updated.\",\"lockedSeats\":[";
  for (size_t i = 0; i < seats.size(); ++i) {
    if (i)
      o << ",";
    o << seats[i];
  }
  o << "],\"expiresAt\":" << expiry << "}";
  return o.str();
}

std::string ReservationSystem::releaseSeatLocks(const std::string &userId,
                                                const std::string &routeId,
                                                const std::string &busId,
                                                const std::string &travelDate,
                                                const std::string &seatCsv) {
  if (userId.empty())
    return fail("User not authenticated.");
  if (!parseYmd(travelDate))
    return fail("Travel date must be in YYYY-MM-DD format.");
  cleanupExpiredLocks();
  std::map<int, bool> targetSeats;
  for (const std::string &s : splitEsc(seatCsv, ',')) {
    if (s.empty())
      continue;
    int seat = 0;
    if (!tryParseIntStrict(s, seat))
      return fail("Invalid seat list.");
    targetSeats[seat] = true;
  }

  int removed = 0;
  for (auto it = seatLocks.begin(); it != seatLocks.end();) {
    const SeatLock &lk = it->second;
    if (lk.userId != userId || lk.routeId != routeId || lk.busId != busId ||
        lk.travelDate != travelDate) {
      ++it;
      continue;
    }
    if (!targetSeats.empty() && targetSeats.find(lk.seat) == targetSeats.end()) {
      ++it;
      continue;
    }
    it = seatLocks.erase(it);
    removed += 1;
  }
  if (removed > 0)
    saveToFiles();
  std::ostringstream o;
  o << "{\"success\":true,\"message\":\"Seat locks released.\",\"released\":" << removed
    << "}";
  return o.str();
}

std::string ReservationSystem::ticketsJson() const {
  std::ostringstream o;
  o << "{\"success\":true,\"tickets\":[";
  size_t i = 0;
  for (const auto &kv : tickets) {
    if (i++)
      o << ",";
    o << kv.second.toJson();
  }
  o << "]}";
  return o.str();
}

std::string ReservationSystem::revenueReportJson() {
  menu("5", "Revenue Report");
  std::map<std::string, int> rev, booked;
  for (const auto &kv : tickets) {
    const Ticket &t = kv.second;
    if (t.cancelled)
      continue;
    rev[t.routeId] += t.fare;
    booked[t.routeId] += 1;
  }
  std::ostringstream o;
  o << "{\"success\":true,\"routes\":[";
  std::vector<std::string> routeIds;
  routeIds.reserve(routes.size() + booked.size());
  for (const auto &rk : routes)
    routeIds.push_back(rk.first);
  for (const auto &kv : booked) {
    if (routes.find(kv.first) == routes.end())
      routeIds.push_back(kv.first);
  }
  size_t i = 0;
  for (const auto &rid : routeIds) {
    auto rit = routes.find(rid);
    const std::string ref = rit != routes.end() ? rit->second.ref : rid;
    if (i++)
      o << ",";
    o << "{"
      << "\"routeId\":\"" << escJson(rid) << "\","
      << "\"ref\":\"" << escJson(ref) << "\","
      << "\"revenue\":" << rev[rid] << ","
      << "\"bookings\":" << booked[rid] << "}";
  }
  o << "]}";
  return o.str();
}

std::string ReservationSystem::popularRouteJson() {
  menu("5", "Most Popular Route");
  std::map<std::string, int> rev, booked;
  for (const auto &kv : tickets) {
    const Ticket &t = kv.second;
    if (t.cancelled)
      continue;
    rev[t.routeId] += t.fare;
    booked[t.routeId] += 1;
  }
  std::string top;
  int topCount = -1;
  for (const auto &kv : booked) {
    if (kv.second > topCount) {
      topCount = kv.second;
      top = kv.first;
    }
  }
  std::string ref = "";
  auto rit = routes.find(top);
  if (rit != routes.end())
    ref = rit->second.ref;
  if (ref.empty())
    ref = top;
  std::ostringstream o;
  o << "{\"success\":true,"
    << "\"routeId\":\"" << escJson(top) << "\","
    << "\"ref\":\"" << escJson(ref) << "\","
    << "\"bookings\":" << (topCount < 0 ? 0 : topCount) << ","
    << "\"revenue\":" << rev[top] << "}";
  return o.str();
}

std::string ReservationSystem::reportsJson() {
  menu("5", "Reports");
  std::map<std::string, int> rev, booked;
  for (const auto &kv : tickets) {
    const Ticket &t = kv.second;
    if (t.cancelled)
      continue;
    rev[t.routeId] += t.fare;
    booked[t.routeId] += 1;
  }
  std::string top;
  int topCount = -1;
  for (const auto &kv : booked) {
    if (kv.second > topCount) {
      topCount = kv.second;
      top = kv.first;
    }
  }
  std::ostringstream o;
  o << "{\"success\":true,\"routes\":[";
  std::vector<std::string> routeIds;
  routeIds.reserve(routes.size() + booked.size());
  for (const auto &rk : routes)
    routeIds.push_back(rk.first);
  for (const auto &kv : booked) {
    if (routes.find(kv.first) == routes.end())
      routeIds.push_back(kv.first);
  }
  size_t i = 0;
  for (const auto &rid : routeIds) {
    auto rit = routes.find(rid);
    const std::string ref = rit != routes.end() ? rit->second.ref : rid;
    if (i++)
      o << ",";
    o << "{"
      << "\"routeId\":\"" << escJson(rid) << "\","
      << "\"ref\":\"" << escJson(ref) << "\","
      << "\"revenue\":" << rev[rid] << ","
      << "\"bookings\":" << booked[rid] << "}";
  }
  o << "],\"mostPopularRouteId\":\"" << escJson(top)
    << "\",\"maxBookings\":" << (topCount < 0 ? 0 : topCount) << "}";
  return o.str();
}

std::string ReservationSystem::terminalLog() const {
  std::ostringstream o;
  for (size_t i = 0; i < logs.size(); ++i) {
    if (i)
      o << "\n";
    o << logs[i];
  }
  return o.str();
}

std::string ReservationSystem::exportSnapshot() const {
  std::ostringstream o;
  o << "ticketCounter|" << ticketCounter << "\n";
  for (const auto &rk : routes) {
    const Route &r = rk.second;
    o << "ROUTE|" << escField(r.routeId) << "|" << escField(r.ref) << "|"
      << escField(r.from) << "|" << escField(r.to) << "|" << r.fare << "|"
      << r.seatCapacity << "|" << escField(r.mapRelationId) << "\n";
    for (const Stop &s : r.stops) {
      std::ostringstream dep;
      for (size_t i = 0; i < s.departures.size(); ++i) {
        if (i)
          dep << ",";
        dep << escField(s.departures[i]);
      }
      o << "STOP|" << escField(r.routeId) << "|" << escField(s.stopId) << "|"
        << escField(s.name) << "|" << escField(s.arrival) << "|" << dep.str()
        << "|" << s.lat << "|" << s.lon << "\n";
    }
    for (const auto &p : r.path) {
      o << "PATH|" << escField(r.routeId) << "|" << p.first << "|" << p.second
        << "\n";
    }
    for (const auto &bk : r.buses) {
      const Bus &b = bk.second;
      o << "BUS|" << escField(r.routeId) << "|" << escField(b.busId) << "|"
        << escField(b.busCode) << "|" << escField(b.displayName) << "|"
        << escField(b.departureTime) << "|" << b.seatCapacity << "\n";
    }
  }
  for (const auto &lkv : seatLocks) {
    const SeatLock &lk = lkv.second;
    o << "LOCK|" << escField(lk.routeId) << "|" << escField(lk.busId) << "|"
      << escField(lk.travelDate) << "|" << lk.seat << "|"
      << escField(lk.userId) << "|" << lk.expiresAt << "\n";
  }
  for (const auto &tk : tickets) {
    const Ticket &t = tk.second;
    std::ostringstream seats, names;
    for (size_t i = 0; i < t.seats.size(); ++i) {
      if (i)
        seats << ",";
      seats << t.seats[i];
    }
    for (size_t i = 0; i < t.passengerNames.size(); ++i) {
      if (i)
        names << ",";
      names << escField(t.passengerNames[i]);
    }
    o << "TICKET|" << escField(t.ticketId) << "|" << escField(t.userId) << "|"
      << escField(t.userName) << "|" << escField(t.routeId) << "|"
      << escField(t.busId) << "|" << seats.str() << "|" << names.str() << "|"
      << t.fare << "|" << (t.cancelled ? 1 : 0) << "|"
      << escField(t.createdAt) << "|" << escField(t.travelDate) << "|"
      << escField(t.boardingStopId) << "|" << escField(t.boardingStopName)
      << "|" << escField(t.dropStopId) << "|" << escField(t.dropStopName)
      << "|" << t.farePerSeat << "|" << escField(t.boardingTime) << "|"
      << escField(t.dropTime) << "\n";
  }
  return o.str();
}

std::string ReservationSystem::importSnapshot(const std::string &snapshot) {
  routes.clear();
  tickets.clear();
  seatLocks.clear();
  ticketCounter = 1;
  std::istringstream in(snapshot);
  std::string line;
  while (std::getline(in, line)) {
    if (line.empty())
      continue;
    auto p = splitEsc(line, '|');
    if (p.empty())
      continue;
    if (p[0] == "ticketCounter" && p.size() > 1) {
      int parsed = 1;
      if (tryParseIntStrict(p[1], parsed))
        ticketCounter = std::max(1, parsed);
    } else if (p[0] == "ROUTE" && p.size() >= 8) {
      int fare = 0;
      if (!tryParseIntStrict(p[5], fare))
        continue;
      Route r;
      r.routeId = p[1];
      r.ref = p[2];
      r.from = p[3];
      r.to = p[4];
      r.fare = fare;
      r.seatCapacity = kFixedSeatCapacity;
      r.mapRelationId = p[7];
      routes[r.routeId] = r;
    } else if (p[0] == "STOP" && p.size() >= 8) {
      auto it = routes.find(p[1]);
      if (it == routes.end())
        continue;
      double lat = 0.0;
      double lon = 0.0;
      if (!tryParseDoubleStrict(p[6], lat) || !tryParseDoubleStrict(p[7], lon))
        continue;
      Stop s;
      s.stopId = p[2];
      s.name = p[3];
      s.arrival = p[4];
      s.departures = splitEsc(p[5], ',');
      s.lat = lat;
      s.lon = lon;
      it->second.stops.push_back(s);
    } else if (p[0] == "PATH" && p.size() >= 4) {
      auto it = routes.find(p[1]);
      if (it == routes.end())
        continue;
      double lat = 0.0;
      double lon = 0.0;
      if (!tryParseDoubleStrict(p[2], lat) || !tryParseDoubleStrict(p[3], lon))
        continue;
      it->second.path.push_back({lat, lon});
    } else if (p[0] == "BUS" && p.size() >= 7) {
      auto it = routes.find(p[1]);
      if (it == routes.end())
        continue;
      Bus b;
      b.busId = p[2];
      b.busCode = p[3];
      b.displayName = p[4];
      b.departureTime = p[5];
      b.seatCapacity = kFixedSeatCapacity;
      it->second.buses[b.busId] = b;
    } else if (p[0] == "LOCK" && p.size() >= 7) {
      int seat = 0;
      long long exp = 0;
      if (!tryParseIntStrict(p[4], seat) || !tryParseLongLongStrict(p[6], exp))
        continue;
      if (seat < 1 || exp <= nowEpochSec())
        continue;
      auto rit = routes.find(p[1]);
      if (rit == routes.end())
        continue;
      auto bit = rit->second.buses.find(p[2]);
      if (bit == rit->second.buses.end())
        continue;
      if (!parseYmd(p[3]))
        continue;
      if (seat > bit->second.seatCapacity)
        continue;
      SeatLock lk;
      lk.routeId = p[1];
      lk.busId = p[2];
      lk.travelDate = p[3];
      lk.seat = seat;
      lk.userId = p[5];
      lk.expiresAt = exp;
      seatLocks[lockKey(lk.routeId, lk.busId, lk.travelDate, lk.seat)] = lk;
    } else if (p[0] == "SEAT" && p.size() >= 6) {
      // Legacy seat rows are ignored. Active seat occupancy is derived from
      // non-cancelled tickets by route+bus+travelDate.
      continue;
    } else if (p[0] == "TICKET" && p.size() >= 10) {
      int fare = 0;
      if (!tryParseIntStrict(p[8], fare))
        continue;
      Ticket t;
      t.ticketId = p[1];
      t.userId = p[2];
      t.userName = p[3];
      t.routeId = p[4];
      t.busId = p[5];
      for (const std::string &s : splitEsc(p[6], ',')) {
        if (!s.empty())
          {
            int seat = 0;
            if (tryParseIntStrict(s, seat))
              t.seats.push_back(seat);
          }
      }
      t.passengerNames = splitEsc(p[7], ',');
      t.fare = fare;
      t.cancelled = p[9] == "1";
      t.createdAt = p.size() > 10 ? p[10] : "";
      t.travelDate = p.size() > 11 ? p[11] : "";
      t.boardingStopId = p.size() > 12 ? p[12] : "";
      t.boardingStopName = p.size() > 13 ? p[13] : "";
      t.dropStopId = p.size() > 14 ? p[14] : "";
      t.dropStopName = p.size() > 15 ? p[15] : "";
      if (p.size() > 16) {
        int parsedFarePerSeat = 0;
        t.farePerSeat = tryParseIntStrict(p[16], parsedFarePerSeat) ? parsedFarePerSeat : 0;
      } else {
        t.farePerSeat = 0;
      }
      t.boardingTime = p.size() > 17 ? p[17] : "";
      t.dropTime = p.size() > 18 ? p[18] : "";
      if (t.farePerSeat <= 0 && !t.seats.empty()) {
        t.farePerSeat = t.fare / static_cast<int>(t.seats.size());
      }
      tickets[t.ticketId] = t;
    }
  }
  saveToFiles();
  return ok("Snapshot imported.");
}

void ReservationSystem::saveToFiles() const {
  std::ofstream out(file, std::ios::trunc);
  out << exportSnapshot();
}

void ReservationSystem::loadFromFiles() {
  std::ifstream in(file);
  if (!in.good())
    return;
  std::ostringstream content;
  content << in.rdbuf();
  importSnapshot(content.str());
}

ReservationSystem g;

std::string apiResetSystem() { return g.reset(); }
std::string apiDisplayRoutesText() { return g.displayRoutesText(); }
std::string apiUpsertRoute(const std::string &routeId, const std::string &ref,
                           const std::string &from, const std::string &to,
                           int fare, int seatCapacity,
                           const std::string &mapRelationId) {
  return g.upsertRoute(routeId, ref, from, to, fare, seatCapacity, mapRelationId);
}
std::string apiDeleteRoute(const std::string &routeId) { return g.deleteRoute(routeId); }
std::string apiUpsertBus(const std::string &routeId, const std::string &busId,
                         const std::string &busCode,
                         const std::string &displayName,
                         const std::string &departureTime, int seatCapacity) {
  return g.upsertBus(routeId, busId, busCode, displayName, departureTime,
                     seatCapacity);
}
std::string apiDeleteBus(const std::string &routeId, const std::string &busId) {
  return g.deleteBus(routeId, busId);
}
std::string apiUpsertStop(const std::string &routeId, const std::string &stopId,
                          const std::string &name, const std::string &arrival,
                          const std::string &departuresCsv, double lat,
                          double lon) {
  return g.upsertStop(routeId, stopId, name, arrival, departuresCsv, lat, lon);
}
std::string apiEditStop(const std::string &routeId, const std::string &stopId,
                        const std::string &name, const std::string &arrival,
                        const std::string &departuresCsv, double lat,
                        double lon) {
  return g.editStop(routeId, stopId, name, arrival, departuresCsv, lat, lon);
}
std::string apiDeleteStop(const std::string &routeId, const std::string &stopId) {
  return g.deleteStop(routeId, stopId);
}
std::string apiClearRoutePath(const std::string &routeId) {
  return g.clearRoutePath(routeId);
}
std::string apiAddPathPoint(const std::string &routeId, double lat, double lon) {
  return g.addPathPoint(routeId, lat, lon);
}
std::string apiDeletePathPoint(const std::string &routeId, int index) {
  return g.deletePathPoint(routeId, index);
}
std::string apiBookTicket(const std::string &userId, const std::string &userName,
                          const std::string &routeId, const std::string &busId,
                          const std::string &seatCsv,
                          const std::string &passengerCsv,
                          const std::string &travelDate,
                          const std::string &boardingStopId,
                          const std::string &dropStopId) {
  return g.bookTicket(userId, userName, routeId, busId, seatCsv, passengerCsv,
                      travelDate, boardingStopId, dropStopId);
}
std::string apiCancelTicket(const std::string &ticketId) { return g.cancelTicket(ticketId); }
std::string apiCancelTicketForUser(const std::string &userId,
                                   const std::string &ticketId) {
  return g.cancelTicketForUser(userId, ticketId);
}
std::string apiDeleteTicketRecord(const std::string &ticketId) {
  return g.deleteTicketRecord(ticketId);
}
std::string apiPurgeCancelledTickets() { return g.purgeCancelledTickets(); }
std::string apiSearchTicket(const std::string &ticketId) { return g.searchTicket(ticketId); }
std::string apiSearchTicketForUser(const std::string &userId,
                                   const std::string &ticketId) {
  return g.searchTicketForUser(userId, ticketId);
}
std::string apiUpdateTicketUserNameForUser(const std::string &userId,
                                           const std::string &userName) {
  return g.updateTicketUserNameForUser(userId, userName);
}
std::string apiUpdateTicketPassengers(const std::string &ticketId,
                                      const std::string &passengerCsv) {
  return g.updateTicketPassengers(ticketId, passengerCsv);
}
std::string apiRoutesJson() { return g.routesJson(); }
std::string apiUpsertSeatLocks(const std::string &userId,
                               const std::string &routeId,
                               const std::string &busId,
                               const std::string &travelDate,
                               const std::string &seatCsv, int ttlSeconds) {
  return g.upsertSeatLocks(userId, routeId, busId, travelDate, seatCsv,
                           ttlSeconds);
}
std::string apiReleaseSeatLocks(const std::string &userId,
                                const std::string &routeId,
                                const std::string &busId,
                                const std::string &travelDate,
                                const std::string &seatCsv) {
  return g.releaseSeatLocks(userId, routeId, busId, travelDate, seatCsv);
}
std::string apiSeatsJson(const std::string &routeId, const std::string &busId,
                         const std::string &travelDate) {
  return g.seatsJson(routeId, busId, travelDate);
}
std::string apiSeatsJsonForUser(const std::string &routeId,
                                const std::string &busId,
                                const std::string &travelDate,
                                const std::string &userId) {
  return g.seatsJsonForUser(routeId, busId, travelDate, userId);
}
std::string apiTicketsJson() { return g.ticketsJson(); }
std::string apiRevenueReportJson() { return g.revenueReportJson(); }
std::string apiPopularRouteJson() { return g.popularRouteJson(); }
std::string apiReportsJson() { return g.reportsJson(); }
std::string apiTerminalLog() { return g.terminalLog(); }
void apiClearTerminal() { g.clearTerminal(); }
std::string apiExportSnapshot() { return g.exportSnapshot(); }
std::string apiImportSnapshot(const std::string &snapshot) {
  return g.importSnapshot(snapshot);
}
std::string apiLoadFromFiles() { return g.loadFromFilesApi(); }

} // namespace

EMSCRIPTEN_BINDINGS(reservation_system_bindings) {
  function("apiResetSystem", &apiResetSystem);
  function("apiDisplayRoutesText", &apiDisplayRoutesText);
  function("apiUpsertRoute", &apiUpsertRoute);
  function("apiDeleteRoute", &apiDeleteRoute);
  function("apiUpsertBus", &apiUpsertBus);
  function("apiDeleteBus", &apiDeleteBus);
  function("apiUpsertStop", &apiUpsertStop);
  function("apiEditStop", &apiEditStop);
  function("apiDeleteStop", &apiDeleteStop);
  function("apiClearRoutePath", &apiClearRoutePath);
  function("apiAddPathPoint", &apiAddPathPoint);
  function("apiDeletePathPoint", &apiDeletePathPoint);
  function("apiBookTicket", &apiBookTicket);
  function("apiCancelTicket", &apiCancelTicket);
  function("apiCancelTicketForUser", &apiCancelTicketForUser);
  function("apiDeleteTicketRecord", &apiDeleteTicketRecord);
  function("apiPurgeCancelledTickets", &apiPurgeCancelledTickets);
  function("apiSearchTicket", &apiSearchTicket);
  function("apiSearchTicketForUser", &apiSearchTicketForUser);
  function("apiUpdateTicketUserNameForUser", &apiUpdateTicketUserNameForUser);
  function("apiUpdateTicketPassengers", &apiUpdateTicketPassengers);
  function("apiRoutesJson", &apiRoutesJson);
  function("apiUpsertSeatLocks", &apiUpsertSeatLocks);
  function("apiReleaseSeatLocks", &apiReleaseSeatLocks);
  function("apiSeatsJson", &apiSeatsJson);
  function("apiSeatsJsonForUser", &apiSeatsJsonForUser);
  function("apiTicketsJson", &apiTicketsJson);
  function("apiRevenueReportJson", &apiRevenueReportJson);
  function("apiPopularRouteJson", &apiPopularRouteJson);
  function("apiReportsJson", &apiReportsJson);
  function("apiTerminalLog", &apiTerminalLog);
  function("apiClearTerminal", &apiClearTerminal);
  function("apiExportSnapshot", &apiExportSnapshot);
  function("apiImportSnapshot", &apiImportSnapshot);
  function("apiLoadFromFiles", &apiLoadFromFiles);
}
