# ตัวอย่างโครงสร้างฝั่ง Python (รับพิกัดมาพร้อมกับรูป)
@app.route('/api/report-flood', methods=['POST'])
def report_flood():
    file = request.files['image']
    lat = request.form['lat']
    lng = request.form['lng']
    details = request.form['details']
    
    # 1. ให้ AI ประเมินภาพ
    depth, status = predict_flood_depth(file)
    
    # 2. บันทึกลง Firebase Firestore (เพื่อให้แผนที่อัปเดตแบบ Real-time)
    # db.collection('flood_reports').add({
    #     'location': {'lat': float(lat), 'lng': float(lng)},
    #     'depth_cm': depth,
    #     'status': status,
    #     'details': details,
    #     'timestamp': firestore.SERVER_TIMESTAMP
    # })
    
    return jsonify({'success': True, 'message': 'รายงานสำเร็จและอัปเดตลงแผนที่แล้ว'})