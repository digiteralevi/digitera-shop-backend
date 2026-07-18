// PART B: WEBHOOK LISTENER
try {
    const eventType = payload?.data?.attributes?.type;
    const attributes = payload?.data?.attributes?.data?.attributes;

    if (!attributes) {
      return res.status(200).json({ status: 'Webhook received but payload structure unknown' });
    }

    // Para sa checkout_session.payment.paid
    let email = attributes?.billing?.email 
              || attributes?.metadata?.customer_email;
    let name = attributes?.billing?.name || "Customer";
    let itemsJson = attributes?.metadata?.purchased_items;
    let itemsArray = [];

    if (itemsJson) {
      try {
        itemsArray = JSON.parse(itemsJson);
      } catch (jsonErr) {
        console.error("JSON Parse error:", jsonErr.message);
      }
    }

    // Kung walang items sa metadata, kuhanin sa line_items
    if (itemsArray.length === 0 && attributes?.line_items) {
      itemsArray = attributes.line_items.map(i => i.name);
    }

    let linksHtml = "";

    if (itemsArray.length > 0 && db) {
      for (const itemName of itemsArray) {
        const snapshot = await db.collection('products')
          .where('name', '==', itemName)
          .get();

        let downloadUrl = null;

        if (!snapshot.empty) {
          snapshot.forEach(doc => {
            const data = doc.data();
            downloadUrl = data.accessLink || data.downloadUrl || data.file_secure_url;
          });
        }

        if (downloadUrl) {
          linksHtml += `
            <div style="margin-bottom:15px; padding:15px; border:1px solid #e0e0e0; border-radius:8px; background:#f9f9f9;">
              <p style="margin:0 0 10px 0;
