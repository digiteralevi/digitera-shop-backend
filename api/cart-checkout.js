// B. WEBHOOK LISTENER (Galing kay PayMongo kapag paid na)
    try {
      // Ligtas na pagkuha ng attributes mula sa payload
      const attributes = payload.data?.attributes?.data?.attributes || payload.data?.attributes;
      
      if (!attributes) {
        return res.status(200).json({ status: 'Webhook received but payload structure unknown' });
      }

      let email = attributes.metadata?.customer_email || attributes.billing?.email;
      let name = attributes.billing?.name || "Customer";

      // Kunin natin ang listahan ng mga biniling items mula sa metadata sa ligtas na paraan
      let itemsJson = attributes.metadata?.purchased_items;
      let itemsArray = [];
      
      if (itemsJson) {
        try {
          itemsArray = JSON.parse(itemsJson);
        } catch (jsonErr) {
          console.error("JSON Parse error:", jsonErr.message);
        }
      }

      // HAHANAPIN NA NATIN ANG TOTOONG LINK MULA SA FIREBASE
      let linksHtml = "";
      
      if (itemsArray.length > 0) {
        for (const itemName of itemsArray) {
          const productsRef = db.collection('products');
          const snapshot = await productsRef.where('name', '==', itemName).get();
          
          let downloadUrl = null;
          
          if (!snapshot.empty) {
            snapshot.forEach(doc => {
              const data = doc.data();
              downloadUrl = data.downloadUrl || data.accessLink || data.secureLink || data.link;
            });
          }

          if (downloadUrl) {
            linksHtml += `
              <div style="margin-bottom: 15px; padding: 15px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #f9f9f9;">
                <p style="margin: 0 0 10px 0; font-weight: bold; color: #333;">${itemName}</p>
                <a href="${downloadUrl}" style="display: inline-block; background-color: #6c5ce7; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;" target="_blank">📥 Download Your Asset</a>
              </div>
            `;
          } else {
            linksHtml += `<p style="color: #555;">Thank you for purchasing <strong>${itemName}</strong>! We are finalizing your download link. If it doesn't appear shortly, please contact support.</p>`;
          }
        }
      } else {
        linksHtml = `<p>Thank you for your purchase! Please contact us with your receipt to claim your digital products.</p>`;
      }

      if (email) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
          },
          body: JSON.stringify({
            from: 'Digitera Shop <onboarding@resend.dev>',
            to: email,
            subject: 'Your Digital Asset Delivery',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                <h1 style="color: #6c5ce7;">Hello ${name}!</h1>
                <p>Thank you for your purchase from Digitera Shop. Your digital assets are ready for download below:</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                
                ${linksHtml}
                
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 12px; color: #777;">If you have any questions or issues with your download, feel free to reply to this email.</p>
              </div>
            `
          })
        });
        return res.status(200).json({ status: 'Email with Firebase links sent successfully!' });
      }
      
      return res.status(200).json({ status: 'Webhook received but email fallback empty' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
