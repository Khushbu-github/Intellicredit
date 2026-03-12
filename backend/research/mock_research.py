def fetch_mca_data(company_name):
    # Mock MCA DIN DQ and Charge details
    return {
        "din_dq": False,
        "charges_created": 3,
        "active_charges_value": 75000000, # ₹7.5Cr
        "directors": ["Rahul Sharma", "Amit Gupta"],
        "red_flags": 0
    }

def fetch_litigation_data(company_name):
    # Mock litigation data (NI Act §138)
    return {
        "cases_found": 1,
        "latest_case": "NI Act §138 - Demand for ₹2.5Cr",
        "jurisdiction": "Delhi High Court"
    }

def fetch_news_sentiment(company_name):
    # Mocking BeautifulSoup/requests scraping
    return {
        "sentiment": "Neutral",
        "mentions": ["Recent expansion in Pune", "Board member reshuffle"]
    }
