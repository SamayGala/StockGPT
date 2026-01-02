#!/usr/bin/env python3
"""
Script to generate Zerodha Kite Connect Access Token
Run this script to get your access token for StockGPT
"""

from kiteconnect import KiteConnect
import webbrowser
import os
from dotenv import load_dotenv

load_dotenv()

# Get API key and secret from environment or prompt user
API_KEY = os.getenv("ZERODHA_API_KEY") or input("Enter your Zerodha API Key: ").strip()
API_SECRET = os.getenv("ZERODHA_API_SECRET") or input("Enter your Zerodha API Secret: ").strip()

if not API_KEY or not API_SECRET:
    print("Error: API Key and Secret are required")
    exit(1)

# Create Kite Connect instance
kite = KiteConnect(api_key=API_KEY)

# Generate login URL
login_url = kite.login_url()
print("\n" + "="*60)
print("ZERODHA KITE CONNECT ACCESS TOKEN GENERATOR")
print("="*60)
print(f"\n1. Opening browser for authorization...")
print(f"   If browser doesn't open, visit this URL manually:")
print(f"   {login_url}\n")

try:
    webbrowser.open(login_url)
except:
    print("   (Could not open browser automatically)")

print("2. Log in with your Zerodha credentials")
print("3. Authorize the application")
print("4. You'll be redirected to a URL that looks like:")
print("   http://localhost:8000/zerodha/callback?request_token=XXXXX&action=login&status=success")
print("\n5. Copy the request_token from the URL (the XXXXX part)\n")

# Get request token from user
request_token = input("Enter the request_token from the redirect URL: ").strip()

if not request_token:
    print("Error: Request token is required")
    exit(1)

try:
    # Generate access token
    print("\nGenerating access token...")
    data = kite.generate_session(request_token, api_secret=API_SECRET)
    access_token = data["access_token"]
    
    print("\n" + "="*60)
    print("SUCCESS! Your Access Token has been generated")
    print("="*60)
    print(f"\nAPI Key: {API_KEY}")
    print(f"API Secret: {API_SECRET}")
    print(f"Access Token: {access_token}")
    
    print("\n" + "="*60)
    print("Add these to your backend/.env file:")
    print("="*60)
    print(f"\nZERODHA_API_KEY={API_KEY}")
    print(f"ZERODHA_API_SECRET={API_SECRET}")
    print(f"ZERODHA_ACCESS_TOKEN={access_token}\n")
    
    # Optionally save to .env file
    save = input("Would you like to save these to .env file automatically? (y/n): ").strip().lower()
    if save == 'y':
        env_file = os.path.join(os.path.dirname(__file__), '.env')
        with open(env_file, 'a') as f:
            f.write(f"\n# Zerodha Kite Connect Credentials\n")
            f.write(f"ZERODHA_API_KEY={API_KEY}\n")
            f.write(f"ZERODHA_API_SECRET={API_SECRET}\n")
            f.write(f"ZERODHA_ACCESS_TOKEN={access_token}\n")
        print(f"\n✓ Credentials saved to {env_file}")
        print("  Restart your backend server to use the new credentials.")
    else:
        print("\nPlease manually add the credentials to your .env file.")
    
except Exception as e:
    print(f"\nError generating access token: {str(e)}")
    print("\nPossible issues:")
    print("1. Request token may have expired (tokens expire quickly)")
    print("2. API key/secret may be incorrect")
    print("3. Request token format may be wrong")
    print("\nPlease try again with a fresh request token.")

