import os
import sys
import json
from deepface import DeepFace

def match_faces(user_photo_path, police_reports_json):
    
    police_reports = json.loads(police_reports_json)
    matches = []

   
    for report in police_reports:
        police_photo_path = report['photo']  

        
        if not os.path.exists(police_photo_path):
            print(f"Police photo not found: {police_photo_path}")
            continue
        
        try:
           
            result = DeepFace.verify(img1_path=user_photo_path, img2_path=police_photo_path)

           
            if result["verified"]:
                matches.append({
                    "fullName": report["fullName"],
                    "approximateAge": report["approximateAge"],
                    "photo": police_photo_path  
                })

        except Exception as e:
            print(f"Error processing photo {police_photo_path}: {e}")
    
    return matches

if __name__ == "__main__":
    
    if len(sys.argv) != 3:
        print("Usage: python face_matcher.py <user_photo_path> <police_reports_json>")
        sys.exit(1)

    user_photo_path = sys.argv[1]  
    police_reports_json = sys.argv[2] 
    
    if not os.path.exists(user_photo_path):
        print(f"User photo not found: {user_photo_path}")
        sys.exit(1)

    results = match_faces(user_photo_path, police_reports_json)
    print(json.dumps(results)) 