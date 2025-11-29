import React, { useEffect, useRef, useState } from 'react'

// Simple helper: Haversine distance (meters)
function haversine([lat1, lon1], [lat2, lon2]) {
  const R = 6371000 // metres
  const toRad = (v) => (v * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export default function App() {
  const mapRef = useRef(null)
  const googleMapRef = useRef(null)
  const placesServiceRef = useRef(null)
  const markersRef = useRef([])

  const [loadingScript, setLoadingScript] = useState(true)
  const [position, setPosition] = useState(null)
  const [places, setPlaces] = useState([])
  const [queryType, setQueryType] = useState('pharmacy')
  const [radius, setRadius] = useState(2000)
  const [status, setStatus] = useState('idle')
  const [selectedPlace, setSelectedPlace] = useState(null)

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  // load Google Maps JS with Places library

  useEffect(() => {
    if (!apiKey) return;

    const existing = document.getElementById("gmaps-script");
    if (!existing) {
      const script = document.createElement("script");
      script.id = "gmaps-script";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&v=weekly`;
      script.async = true;
      script.defer = true;

      script.onload = () => {
        setTimeout(() => setLoadingScript(false), 0); // avoid synchronous setState
      };
      script.onerror = () => {
        setTimeout(() => setStatus("script_error"), 0);
      };

      document.head.appendChild(script);
    } else {
      setTimeout(() => setLoadingScript(false), 0);
    }
  }, [apiKey]);

  // Initialize Google Map once script is loaded
  useEffect(() => {
    if (loadingScript || !window.google) return;

    googleMapRef.current = new window.google.maps.Map(mapRef.current, {
      center: { lat: 26.8206, lng: 30.8025 },
      zoom: 12,
      fullscreenControl: false,
    });

    placesServiceRef.current = new window.google.maps.places.PlacesService(
      googleMapRef.current
    );
  }, [loadingScript]);

  // Get user position after map is ready
  useEffect(() => {
    if (loadingScript) return;
    if (!navigator.geolocation) {
      setTimeout(() => setStatus("no_geolocation"), 0);
      return;
    }

    setTimeout(() => setStatus("getting_location"), 0);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = [pos.coords.latitude, pos.coords.longitude];
        setPosition(coords);

        if (googleMapRef.current) {
          googleMapRef.current.setCenter({ lat: coords[0], lng: coords[1] });
        }

        setTimeout(() => setStatus("ready"), 0);
      },
      (err) => {
        console.warn(err);
        setTimeout(() => setStatus("location_denied"), 0);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [loadingScript]);
  


  // helper to clear markers
  function clearMarkers() {
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []
  }

  // search nearby places
  function searchNearby() {
    if (!placesServiceRef.current || !position) return
    setStatus('searching')
    clearMarkers()
    const [lat, lng] = position
    const request = {
      location: new window.google.maps.LatLng(lat, lng),
      radius: Number(radius),
      type: queryType,
    }
    placesServiceRef.current.nearbySearch(request, (results, statusRes) => {
      if (statusRes !== window.google.maps.places.PlacesServiceStatus.OK) {
        setStatus('no_results')
        setPlaces([])
        return
      }

      const withDist = results.map(r => {
        const d = haversine([lat, lng], [r.geometry.location.lat(), r.geometry.location.lng()])
        return {
          id: r.place_id,
          name: r.name,
          location: [r.geometry.location.lat(), r.geometry.location.lng()],
          vicinity: r.vicinity || '',
          rating: r.rating || null,
          user_ratings_total: r.user_ratings_total || 0,
          distance_m: Math.round(d),
          raw: r,
        }
      })

      withDist.sort((a, b) => a.distance_m - b.distance_m)
      setPlaces(withDist)
      setStatus('results')

      // add markers
      withDist.forEach((p, idx) => {
        const marker = new window.google.maps.Marker({
          position: { lat: p.location[0], lng: p.location[1] },
          map: googleMapRef.current,
          label: `${ idx + 1 } `,
        })
        marker.addListener('click', () => setSelectedPlace(p))
        markersRef.current.push(marker)
      })

      // fit map bounds
      const bounds = new window.google.maps.LatLngBounds()
      bounds.extend(new window.google.maps.LatLng(lat, lng))
      withDist.forEach(p => bounds.extend(new window.google.maps.LatLng(p.location[0], p.location[1])))
      googleMapRef.current.fitBounds(bounds)
    })
  }

  // helper: focus place
  function focusPlace(p) {
    setSelectedPlace(p)
    googleMapRef.current.panTo({ lat: p.location[0], lng: p.location[1] })
    googleMapRef.current.setZoom(16)
  }

  // small analysis
  const countInRadius = (rMeters) => {
    if (!position) return 0
    return places.filter(p => p.distance_m <= rMeters).length
  }

  return (
    <div className="app-root">
      <div className="sidebar">
        <h1 className="title">Nearby Services Map</h1>

        {!apiKey && (
          <div className="alert">No API key found. Put VITE_GOOGLE_MAPS_API_KEY in .env</div>
        )}

        <div className="control">
          <label>Type</label>
          <select value={queryType} onChange={(e) => setQueryType(e.target.value)}>
            <option value="pharmacy">Pharmacy</option>
            <option value="atm">ATM</option>
            <option value="hospital">Hospital</option>
            <option value="restaurant">Restaurant</option>
            <option value="bank">Bank</option>
            <option value="supermarket">Supermarket</option>
          </select>
        </div>

        <div className="control">
          <label>Radius (meters)</label>
          <input type="range" min={500} max={5000} step={100} value={radius} onChange={(e) => setRadius(e.target.value)} />
          <div className="small">{radius} m</div>
        </div>

        <div className="actions">
          <button className="btn" onClick={searchNearby} disabled={!position || status === 'searching'}>
            {status === 'searching' ? 'Searching…' : 'Find Nearby'}
          </button>
          <button className="btn ghost" onClick={() => position && googleMapRef.current.panTo({ lat: position[0], lng: position[1] })}>
            Center on me
          </button>
        </div>

        <div className="analysis">
          <h3>Quick Analysis</h3>
          <div className="stat">Found: <strong>{places.length}</strong></div>
          <div className="stat">Within 500m: <strong>{countInRadius(500)}</strong></div>
          <div className="stat">Within 1km: <strong>{countInRadius(1000)}</strong></div>
          <div className="stat">Closest: <strong>{places[0]?.name || '—'}</strong></div>
        </div>

        <div className="results">
          {places.slice(0, 30).map((p, idx) => (
            <div key={p.id} className={`card ${ selectedPlace?.id === p.id ? 'active' : '' } `} onClick={() => focusPlace(p)}>
              <div className="card-title">{idx + 1}. {p.name}</div>
              <div className="card-sub">{p.vicinity}</div>
              <div className="card-meta">{p.distance_m} m • {p.rating ? `${ p.rating } ⭐ (${ p.user_ratings_total })` : 'No rating'}</div>
            </div>
          ))}
          {places.length === 0 && <div className="muted">No results yet — press "Find Nearby"</div>}
        </div>

        <footer className="footer">Demo for portfolio • Google Places + Maps • Amira-style UI</footer>
      </div>

      <div className="map-pane">
        <div ref={mapRef} id="map" style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}
