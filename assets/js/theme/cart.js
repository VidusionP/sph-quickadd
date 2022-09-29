import PageManager from './page-manager';
import $ from 'jquery';
import _ from 'lodash';
import giftCertCheck from './common/gift-certificate-validator';
import utils from '@bigcommerce/stencil-utils';
import ShippingEstimator from './cart/shipping-estimator';
import { defaultModal } from './global/modal';
import swal from 'sweetalert2';

export default class Cart extends PageManager {
    loaded(next) {
        this.$cartContent = $('[data-cart-content]');
        this.$cartMessages = $('[data-cart-status]');
        this.$cartTotals = $('[data-cart-totals]');
        this.$overlay = $('[data-cart] .loadingOverlay')
            .hide(); // TODO: temporary until roper pulls in his cart components

        this.bindEvents();

        next();
    }    

    cartUpdate($target) {        
        // const itemId = $target.data('cart-itemid');
        // const $el = $(`#qty-${itemId}`);
        // const oldQty = parseInt($el.val(), 10);
        // const maxQty = parseInt($el.data('quantity-max'), 10);
        // const minQty = parseInt($el.data('quantity-min'), 10);
        // const minError = $el.data('quantity-min-error');
        // const maxError = $el.data('quantity-max-error');
        // // const newQty = $target.data('action') === 'inc' ? oldQty + 1 : oldQty - 1;
        // const newQty = $target.data('action') === 'inc' ? oldQty + 1 : $target.data('action') === 'dec' ? oldQty - 1 : parseInt($el.val(), 10);
        const itemId = $target.data('cartItemid');
        const $el = $(`#qty-${itemId}`);
        const oldQty = parseInt($el.val(), 10);
        const maxQty = parseInt($el.data('quantityMax'), 10);
        const minQty = parseInt($el.data('quantityMin'), 10);
        const minError = $el.data('quantityMinError');
        const maxError = $el.data('quantityMaxError');
        const newQty = $target.data('action') ? $target.data('action') === 'inc' ? oldQty + 1 : oldQty - 1 : oldQty;     

        if (newQty < minQty) {
            return swal({
                text: minError,
                icon: 'error',
            });
        } else if (maxQty > 0 && newQty > maxQty) {
            return swal({
                text: maxError,
                icon: 'error',
            });
        }

        this.$overlay.show();

        utils.api.cart.itemUpdate(itemId, newQty, (err, response) => {
            // this.$overlay.hide();            
            if (response.data.status === 'succeed') {
                // if the quantity is changed "1" from "0", we have to remove the row.
                const remove = (newQty === 0);

                // this.refreshContent(remove);                
                this.cartCheckSI(remove);
            } else {
                $el.val(oldQty);
                swal({
                    text: response.data.errors.join('\n'),
                    icon: 'error',
                });
                this.$overlay.hide();
            }
        });

    }

    /**
     * Remove Item from cart
     * 
     * @param {string} itemId Id of item
     * @param {boolean} isSI True if this item is Shipping Insurance
     */
    cartRemoveItem(itemId, isSI=false) {
        this.$overlay.show();
        utils.api.cart.itemRemove(itemId, (err, response) => {
            if (response.data) {
                if (response.data.status === 'succeed') {
                    // this.refreshContent(true);                
                    if (isSI) {                    
                        location.href="/cart.php?sio=true";
                    } else {
                        this.cartCheckSI(true);
                    }
                } else {
                    swal({
                        text: response.data.errors.join('\n'),
                        type: 'error',
                    });
                }
            } else {
                swal({
                    text: 'Server has error in removing. Please reload the page and try again',
                    type: 'error',
                });
            }

        });
    }

    cartEditOptions(itemId) {
        const modal = defaultModal();
        const options = {
            template: 'cart/modals/configure-product',
        };

        modal.open();

        utils.api.productAttributes.configureInCart(itemId, options, (err, response) => {
            modal.updateContent(response.content);

            this.bindGiftWrappingForm();
        });

        utils.hooks.on('product-option-change', (event, option) => {
            const $changedOption = $(option);
            const $form = $changedOption.parents('form');
            const $submit = $('input.button', $form);
            const $messageBox = $('.alertMessageBox');
            const item = $('[name="item_id"]', $form).attr('value');

            utils.api.productAttributes.optionChange(item, $form.serialize(), (err, result) => {
                const data = result.data || {};

                if (err) {
                    swal({
                        text: err,
                        type: 'error',
                    });
                    return false;
                }

                if (data.purchasing_message) {
                    $('p.alertBox-message', $messageBox).text(data.purchasing_message);
                    $submit.prop('disabled', true);
                    $messageBox.show();
                } else {
                    $submit.prop('disabled', false);
                    $messageBox.hide();
                }

                if (!data.purchasable || !data.instock) {
                    $submit.prop('disabled', true);
                } else {
                    $submit.prop('disabled', false);
                }
            });
        });
    }

    getParameterByName(name, url = window.location.href) {
        name = name.replace(/[\[\]]/g, '\\$&');
        var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
            results = regex.exec(url);
        if (!results) return null;
        if (!results[2]) return '';
        return decodeURIComponent(results[2].replace(/\+/g, ' '));
    }

    findShippingInsurance(arr) {        
        let result = [];
        for (let i = arr.length - 1; i >= 0; i--) {            
            if (arr[i].sku.includes("SKUSI")) {
                result.push(arr[i]);
            }
        }
        if (result.length == 0) {
            return null;
        } else {
            return result;
        }
    }

    /**
     * @summary Remove Shipping Items from cart
     * 
     * @param {integer} idx Index of current Shipping Item
     * @param {Array} shippingItems Array of Shipping Item
     * @param {function} callback Call back function after done deleting 
     * @returns void
     */
    cartRemoveSI(idx, shippingItems, callback) {
        if (idx==shippingItems.length) {
            callback();
        } else {                  
            utils.api.cart.itemRemove(shippingItems[idx].id, (err, removedData) => {                
                if (err) {
                    return;
                }
                this.cartRemoveSI(idx+1, shippingItems, callback);
            })
        }
    }

    /**
     * Hide Apple pay or not
     * 
     * @param {boolean} isHidden If Apple pay should be hidden
     */
    cartHideApple(isHidden) {        
        let count = 0;
        let runCheck = setInterval(function() {
            if ($("body").hasClass("apple-pay-supported") || $("body").hasClass("pace-done") || count>7) {                
                clearInterval(runCheck);                
                if ($("body").hasClass("apple-pay-supported") && isHidden) {
                    $(".ApplePayCheckout").addClass("apple-hide");
                } else {
                    $(".ApplePayCheckout").removeClass("apple-hide");
                }
            } else {                
                count++;
            }
        },500);
    }

    /**
     * Check for available Apple payment
     * 
     * @param {json} cartItems Cart information
     */
    cartCheckPayment(cartItems) {
        let token = $("[name=store-token]").val();
        let group = $("[name=customer-group]").val();
        switch (group) {
            case "":
                this.cartHideApple(true);
                break;
            case "Blocklist":
                this.cartHideApple(true);
                break;
            case "Newcomer":
                if (cartItems) {
                    let ids = cartItems.lineItems.physicalItems.map(i=>i.productId);
                    fetch('/graphql', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ query: `
                        query SeveralProductsByID {
                            site {
                                products(entityIds: [${ids.join(",")}]) {
                                    edges {
                                        node {
                                            name
                                            sku
                                            entityId
                                            metafields (namespace: "shipping.shipperhq") {
                                                edges {
                                                    node {
                                                        key
                                                        value
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        ` })
                    })
                    .then(r=>r.json())
                    .then(r=>{
                        if (r.data) {
                            let pShippingGroup=[];
                            for (let product of r.data.site.products.edges) {
                                let shippingGroup = null;
                                if (product.node.metafields.edges.length>0) {
                                    for (let group of product.node.metafields.edges) {
                                        if (group.node.key == "shipping-groups") {
                                            shippingGroup = group.node.value;
                                            break;
                                        }
                                    }
                                }                    
                                pShippingGroup[product.node.entityId] = shippingGroup;
                            }
                            let totalSI=0, totalhp=0; 
                            for (let item of cartItems.lineItems.physicalItems) {
                                if (item.sku.includes("SKUSI")) {
                                    totalSI+=item.salePrice;                                                               
                                } else {
                                    if (pShippingGroup[item.productId]) {
                                        if (pShippingGroup[item.productId].toLowerCase().includes("hairpiece")) {
                                            totalhp += item.quantity;
                                        }
                                    }         
                                }
                            }
                            if ((cartItems.baseAmount - totalSI)>500 || totalhp>2) {
                                this.cartHideApple(true);
                            } else {
                                this.cartHideApple(false);
                            }
                        }
                    })
                    .catch(e=>console.log(e));
                }
                break;
            default:
                this.cartHideApple(false);
                break;
        }        
    }

    /**
     * @summary Check and update Shipping Insurance
     * 
     * @param {boolean} remove Check if it is from Remove or not, default is false
     */
    cartCheckSI(remove) {                
        let $this = this;  
        $this.$overlay.show();
        $this.$overlay.html("<span>Checking Shipping Insurance</span>");
        utils.api.cart.getCart({}, (err, myCart) => {
            if (err) {
                return;
            }
            if (myCart.length==0) {
                $this.refreshContent(remove);
                return;
            }
            let cartItems = myCart[0].lineItems.physicalItems;
            $this.cartCheckPayment({
                id: myCart[0].id,
                baseAmount: myCart[0].baseAmount,
                lineItems: myCart[0].lineItems
            });
            let academy = cartItems.filter(item=>item.sku=="academymono" || item.sku=="academylace" || item.sku=="academyskin" || item.sku=="academyExtended" || item.sku=="academyStarter");
            let totalAmount = myCart[0].baseAmount;            
            if (academy.length>0) {
                let sum_academy = academy.reduce((a,b)=>a+b.salePrice,0);
                totalAmount = myCart[0].baseAmount - sum_academy;                
            }
            let shippingItems = this.findShippingInsurance(cartItems);            
                        
            if (shippingItems) {
                if (shippingItems.length>1) {
                    let salePrice = shippingItems.reduce((a,b)=>a+b.salePrice*b.quantity,0);
                    let totalWithoutShipping = totalAmount - salePrice;
                    $this.$overlay.html("<span>Updating Shipping Insurance</span>");
                    $this.cartRemoveSI(0, shippingItems, function() {                        
                        if (totalWithoutShipping>=1000) {
                            let insurance = Math.floor(totalWithoutShipping*0.01);
                            let url = "/cart.php?action=add&sku=SKUSI-"+(insurance-9);        
                            $.get(url, function(data) {                                
                                $this.refreshContent(remove);
                            });                            
                        } else {
                            // $this.$overlay.hide();
                            // $this.cartGetDelivery();
                            $this.refreshContent(remove);
                        }
                    })
                } else {
                    let salePrice = shippingItems[0].salePrice*shippingItems[0].quantity;
                    let totalWithoutShipping = totalAmount - salePrice;
                    let insurance = Math.floor(totalWithoutShipping*0.01);                       
                    if (totalWithoutShipping==0) {
                        $this.cartRemoveSI(0, shippingItems, function() {                            
                            window.location.reload();
                        })
                    } else if (insurance!=Math.ceil(salePrice)) {                        
                        $this.$overlay.html("<span>Updating Shipping Insurance</span>");                      
                        $this.cartRemoveSI(0, shippingItems, function() {                        
                            if (totalWithoutShipping>=1000) {                                                              
                                let url = "/cart.php?action=add&sku=SKUSI-"+(insurance-9);                                   
                                $.get(url, function(data) {
                                    $this.refreshContent(remove);
                                });                                
                            } else {
                                // $this.$overlay.hide();
                                // $this.cartGetDelivery();
                                $this.refreshContent(remove);
                            }
                        })
                    } else {                        
                        // $this.$overlay.hide();
                        // $this.cartGetDelivery();
                        $this.refreshContent(remove);
                    }
                }
            } else {
                if (totalAmount>=1000 && totalAmount<2000) {
                    const sioParam = this.getParameterByName('sio');                    
                    if (sioParam){
                        $this.$overlay.hide();
                        this.cartGetDelivery();
                    } else {
                        let insurance = Math.floor(totalAmount*0.01);
                        let url = "/cart.php?action=add&sku=SKUSI-"+(insurance-9);
                        $this.$overlay.html("<span>Updating Shipping Insurance</span>");
                        $.get(url, function(data) {                            
                            $this.refreshContent();
                        });
                    }
                } else if (totalAmount>=2000) {
                    let insurance = Math.floor(totalAmount*0.01);
                    let url = "/cart.php?action=add&sku=SKUSI-"+(insurance-9);
                    $this.$overlay.html("<span>Updating Shipping Insurance</span>");
                    $.get(url, function(data) {                            
                        $this.refreshContent(remove);
                    });
                } else {
                    $this.refreshContent(remove);
                }
            }
        })                
    }


    /**
     * @summary Find the months difference
     * 
     * @param {Date} d1 Time to compare
     * @param {Date} d2 Time to compare
     * @returns Months difference. Value is 0 if d1 later than d2
     */
    monthDiff(d1, d2) {
        var months;
        months = (d2.getFullYear() - d1.getFullYear()) * 12;
        months -= d1.getMonth();
        months += d2.getMonth();
        return months <= 0 ? 0 : months;
    }

    /**
     * @summary Get SKU list from table GUI and display ship out time
     * 
     * @param {Array} items Item list from Teamdesk
     * @param {Array} skus List of SKU
     * @param {Array} po PO list of item from Teamdesk
     */
    cartGetDelivery(items=null, skus=[], po=null) {
        if (items==null) {            
            Array.from($("tr.cart-item")).forEach(r=>{            
                let sku = $(r).data("sku");
                if (sku.indexOf("_N")==sku.length-2) {
                    sku = sku.slice(0,sku.length-2);                
                }    
                skus.push(sku.replace("#","%23"));      
            });
            fetch(`//shp-webserver.glitch.me/get-teamdesk`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    accept: 'application/json'
                },
                body: JSON.stringify({
                    table: 'Inventory',
                    filter: `Any([SKU],'${skus.join(",")}')`
                })
            })
            .then(r=>r.json())
            .then(r=>{
                if (r.length>0) {
                    this.cartGetDelivery(r, skus);
                }
            })
            .catch(e=>console.log(e));
        } else if (po==null) {            
            fetch(`//shp-webserver.glitch.me/get-teamdesk`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    table: 't_763479',
                    options: `?filter=Any([SKU],'${skus.join(",")}') and [Incoming Quantity]>0 and [Arrival Due Date]>ToDate('1/1/1')&sort=Arrival Due Date//ASC`                        
                })
            })
            .then(r=>r.json())
            .then(r=>{
                if (r.length>0) {
                    this.cartGetDelivery(items, skus, r);
                } else {
                    this.cartGetDelivery(items, skus, []);
                }
            })
            .catch(e=>{
                this.cartGetDelivery(items, skus, []);
            })
        } else {            
            let qtyChecked={};            
            Array.from($("tr.cart-item")).forEach(r=>{
                let $el = $(r);                                            
                let isSpecial = false;
                try {                    
                    let sku = $el.data("sku");
                    if (sku.indexOf("_N")==sku.length-2) {
                        sku = sku.slice(0,sku.length-2);                
                    }   
                    let item = items.find(s=>s.SKU.toUpperCase()==sku.toUpperCase());
                    
                    if (item) {
                        let qty = $el.find(".cart-item-quantity input").val();
                        let buff = 0;
                        if (qtyChecked[item.SKU]) {
                            buff = qtyChecked[item.SKU];
                            qtyChecked[item.SKU]+=qty;
                        } else {
                            qtyChecked[item.SKU]=qty;
                        }            
                        let content=`<strong>Estimated ship out time:</strong><br/>`;
                        if (item["Total On Hand"] == item["Available Quantity"]) {
                            if (Number(item["Quantity USA"])>0) {
                                if (Number(item["Quantity USA"])-buff>0) {
                                    content+=`Immediately: quantity <strong>${Math.min(item["Quantity USA"]-buff, qty)}</strong><br/>`;
                                    qty = qty - Math.min(item["Quantity USA"]-buff, qty);
                                    buff=0;
                                } else {
                                    buff-=Number(item["Quantity USA"]);
                                }
                            }
                            if (Number(item["Quantity Canada"])>0 && qty>0) {
                                if (Number(item["Quantity Canada"])-buff>0) {
                                    content+=`2-4 days: quantity <strong>${Math.min(item["Quantity Canada"]-buff, qty)}</strong><br/>`;
                                    qty = qty - Math.min(item["Quantity Canada"]-buff, qty);
                                    buff=0;
                                } else {
                                    buff -= Number(item["Quantity Canada"]);
                                }
                            }
                        } else {
                            if (Number(item["Available Quantity"])>0) {
                                if (Number(item["Available Quantity"])-buff>0) {
                                    content+=`1-4 days: quantity <strong>${Math.min(item["Available Quantity"]-buff, qty)}</strong><br/>`;
                                    qty = qty - Math.min(item["Available Quantity"]-buff, qty);
                                    buff=0;
                                } else {
                                    buff -= Number(item["Available Quantity"]);
                                }
                            }
                        }
                        if (item["Virtual Quantity"] && qty>0) {                            
                            if (item["Lock Status"]!="Locked for processing" && Number(item["Unlocked for sale quantity"]) > 0 && qty>0) {
                                if (Number(item["Unlocked for sale quantity"])-buff > 0) {                                    
                                    content+=`1 week later: quantity <strong>${Math.min(item["Unlocked for sale quantity"]-buff, qty)}</strong><br/>`;                                    
                                    qty = qty - Math.min(item["Unlocked for sale quantity"]-buff, qty);                                    
                                    buff=0;
                                } else {
                                    buff-=Number(item["Unlocked for sale quantity"]);
                                }
                            }
                            let virtual={};                        
                            if (Number(item["Quantity Incoming"])-2 > 0 && qty>0) {                                
                                if (Number(item["Quantity Incoming"])-2 -buff > 0) {
                                    isSpecial = true;
                                    let inItems = po.filter(p=>p.SKU.toUpperCase() == item["SKU"].toUpperCase());
                                    let i=0, totalP=buff, tempqty = qty;
                                    while (i<inItems.length && tempqty>0) {
                                        totalP+=Number(inItems[i]["Incoming Quantity"]);
                                        tempqty = tempqty - Math.min(Number(inItems[i]["Incoming Quantity"]), tempqty);
                                        i++;                                
                                    }
                                    if (i>0) {
                                        let inItem = inItems[i-1];
                                        let allureException = ['coco', 'rose', 'adele', 'angelina', 'jessica', 'selena', 'taylor', 'julia', 'nicole', 'gwyneth', 'ev7914', 'tl6814', 'ev5714', 'mo5514', 'mo7608', 'ev5512', 'ev5706', 'ev6810', 'eg6612', 'eh16', 'mh2206', 'sh5206', 'ep3608', 'mh2216', 'maya', 'noya'];
                                        let mdiff = this.monthDiff(new Date(), new Date(inItem["Arrival Due Date"]));
                                        if (mdiff==0) {                                    
                                            if (allureException.includes(inItem["Part Number"])) {
                                                mdiff+=3;
                                            } else {
                                                mdiff+=1;
                                            }
                                        } else if (allureException.includes(inItem["Part Number"])) {
                                            mdiff+=2;
                                        }
                                        virtual[mdiff] = Math.min(totalP, qty);                                        
                                        qty = tempqty;
                                        buff=0;
                                    }
                                } else {
                                    buff = buff - Number(item["Quantity Incoming"]) + 2;
                                }
                            }
                            if (qty>0) {
                                isSpecial = true;
                                let m = item["Virtual Location"].slice(0,-1);
                                if (virtual[m]) {
                                    virtual[m]+=qty;
                                } else {
                                    virtual[m]=qty;
                                }
                            }
                            // console.log(virtual);
                            if (Object.keys(virtual).length > 0) {
                                const options = {year: 'numeric', month: 'long'};
                                let vkeys = Object.keys(virtual).sort(function(a,b) {
                                    return b-a;
                                })                
                                for (let key of vkeys) {
                                    if (Number(key)) {
                                        let date = new Date();
                                        date = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
                                        date.setMonth(date.getMonth()+Number(key));
                                        content+=`${date.toLocaleDateString('en-US', options)}: quantity <strong>${virtual[key]}</strong><br/>`;
                                    } else {
                                        content+=`${key.replace("_","-")} months later: quantity <strong>${virtual[key]}</strong><br/>`;
                                    }
                                }
                            }
                        }
                        $el.find(".cart-item-title").find(".cart-shipout").html(content).css({"height": "auto"});                        
                        if (isSpecial) {
                            $el.find(".cart-item-title").find(".cart-shipout").addClass("delivery-highlight");
                        }
                    } else {
                        var cmhRushItems = ['CMH', 'CMLACE', 'CMMONO', 'CMLACEPOLY', 'CMSKIN'];
                        var hairService = [
                            "style#221",
                            "style#222",
                            "style#231",
                            "style#232",
                            "style#233",
                            "style#234",
                            "style#251",
                            "style#331",
                            "style#332",
                            "style#334",
                            "style#335",
                            "style#341",
                            "style#342",
                            "style#343",
                            "style#551",
                            "style#552",
                            "Style #Your_Own",
                            "Online Services Pack",
                          ];
                        let content = "";
                        if (cmhRushItems.includes($el.data("sku").toUpperCase())) {
                            content=`<strong>Estimated ship out time:</strong><br/>3-month guaranteed delivery<br/>`;
                        } else if (hairService.includes($el.data("sku"))) {
                            content=`<strong>Estimated ship out time:</strong><br/>Handling time 1-2 weeks<br/>`;
                        } 
                        $el.find(".cart-item-title").find(".cart-shipout").html(content).css({"height": "auto"});

                    }
                    
                } catch (err) {
                    console.log(err);
                }       
            });            
        }         
    }

    refreshContent(remove) {
        const $cartItemsRows = $('[data-item-row]', this.$cartContent);
        const $cartPageTitle = $('[data-cart-page-title]');
        const options = {
            template: {
                content: 'cart/content',
                totals: 'cart/totals',
                pageTitle: 'cart/page-title',
                statusMessages: 'cart/status-messages',
            },
        };

        this.$overlay.show();

        // Remove last item from cart? Reload
        if (remove && $cartItemsRows.length === 1) {
            return window.location.reload();
        }

        utils.api.cart.getContent(options, (err, response) => {
            this.$cartContent.html(response.content);
            this.$cartTotals.html(response.totals);
            this.$cartMessages.html(response.statusMessages);

            $cartPageTitle.replaceWith(response.pageTitle);
            this.bindEvents();
            this.$overlay.hide();
            this.$overlay.html("");

            const quantity = $('[data-cart-quantity]', this.$cartContent).data('cart-quantity') || 0;

            $('body').trigger('cart-quantity-update', quantity);
            this.cartGetDelivery();
        });
    }

    bindCartEvents() {
        const debounceTimeout = 400;
        const cartUpdate = _.bind(_.debounce(this.cartUpdate, debounceTimeout), this);
        const cartRemoveItem = _.bind(_.debounce(this.cartRemoveItem, debounceTimeout), this);

        // cart update
        $('[data-cart-input-update]', this.$cartContent).on('change', (event) => {            
            const $target = $(event.currentTarget);

            event.preventDefault();

            // update cart quantity
            cartUpdate($target);
        });
        $('[data-cart-update]', this.$cartContent).on('click', (event) => {            
            const $target = $(event.currentTarget);

            event.preventDefault();

            // update cart quantity
            cartUpdate($target);
        });

        $('.cart-remove', this.$cartContent).on('click', (event) => {
            const itemId = $(event.currentTarget).data('cart-itemid');
            const string = $(event.currentTarget).data('confirm-delete');
            const sku = $(event.currentTarget).data('sku');
            if (sku.includes("SKUSI")) {
                const amount = $(event.currentTarget).data('amount');                
                if (amount>=20) {
                    swal({
                        text: "Orders with a value of $1,999 or more require shipping insurance",
                        type: 'info',                        
                    })
                } else {
                    swal({
                        text: "You will NOT be covered for your order in case it is lost, damaged or stolen. Are you sure to remove this option?",
                        type: 'warning',
                        showCancelButton: true,
                    }).then(() => {
                        // remove item from cart
                        cartRemoveItem(itemId, true);
                    });
                    event.preventDefault();
                }
            } else {
                swal({
                    text: string,
                    type: 'warning',
                    showCancelButton: true,
                }).then(() => {
                    // remove item from cart
                    cartRemoveItem(itemId);
                });
                event.preventDefault();
            }

        });

        $('[data-item-edit]', this.$cartContent).on('click', (event) => {
            const itemId = $(event.currentTarget).data('item-edit');

            event.preventDefault();
            // edit item in cart
            this.cartEditOptions(itemId);
        });
    }

    bindPromoCodeEvents() {
        const $couponContainer = $('.coupon-code');
        const $couponForm = $('.coupon-form');
        const $codeInput = $('[name="couponcode"]', $couponForm);

        $('.coupon-code-add').on('click', (event) => {
            event.preventDefault();

            $(event.currentTarget).hide();
            $couponContainer.show();
            $('.coupon-code-cancel').show();
            $codeInput.focus();
        });

        $('.coupon-code-cancel').on('click', (event) => {
            event.preventDefault();

            $couponContainer.hide();
            $('.coupon-code-cancel').hide();
            $('.coupon-code-add').show();
        });

        $couponForm.on('submit', (event) => {
            const code = $codeInput.val();

            event.preventDefault();

            // Empty code
            if (!code) {
                return swal({
                    text: $codeInput.data('error'),
                    type: 'error',
                });
            }

            utils.api.cart.applyCode(code, (err, response) => {
                if (response.data.status === 'success') {
                    this.refreshContent();
                } else {
                    swal({
                        text: response.data.errors.join('\n'),
                        type: 'error',
                    });
                }
            });
        });
    }

    bindGiftCertificateEvents() {
        const $certContainer = $('.gift-certificate-code');
        const $certForm = $('.cart-gift-certificate-form');
        const $certInput = $('[name="certcode"]', $certForm);

        $('.gift-certificate-add').on('click', (event) => {
            event.preventDefault();
            $(event.currentTarget).toggle();
            $certContainer.toggle();
            $('.gift-certificate-cancel').toggle();
        });

        $('.gift-certificate-cancel').on('click', (event) => {
            event.preventDefault();
            $certContainer.toggle();
            $('.gift-certificate-add').toggle();
            $('.gift-certificate-cancel').toggle();
        });

        $certForm.on('submit', (event) => {
            const code = $certInput.val();

            event.preventDefault();

            if (!giftCertCheck(code)) {
                return swal({
                    text: $certInput.data('error'),
                    type: 'error',
                });
            }

            utils.api.cart.applyGiftCertificate(code, (err, resp) => {
                if (resp.data.status === 'success') {
                    this.refreshContent();
                } else {
                    swal({
                        text: resp.data.errors.join('\n'),
                        type: 'error',
                    });
                }
            });
        });
    }

    bindGiftWrappingEvents() {
        const modal = defaultModal();

        $('[data-item-giftwrap]').on('click', (event) => {
            const itemId = $(event.currentTarget).data('item-giftwrap');
            const options = {
                template: 'cart/modals/gift-wrapping-form',
            };

            event.preventDefault();

            modal.open();

            utils.api.cart.getItemGiftWrappingOptions(itemId, options, (err, response) => {
                modal.updateContent(response.content);

                this.bindGiftWrappingForm();
            });
        });
    }

    bindGiftWrappingForm() {
        $('.giftWrapping-select').change((event) => {
            const $select = $(event.currentTarget);
            const id = $select.val();
            const index = $select.data('index');

            if (!id) {
                return;
            }

            const allowMessage = $select.find(`option[value=${id}]`).data('allow-message');

            $(`.giftWrapping-image-${index}`).hide();
            $(`#giftWrapping-image-${index}-${id}`).show();

            if (allowMessage) {
                $(`#giftWrapping-message-${index}`).show();
            } else {
                $(`#giftWrapping-message-${index}`).hide();
            }
        });

        $('.giftWrapping-select').trigger('change');

        function toggleViews() {
            const value = $('input:radio[name ="giftwraptype"]:checked').val();
            const $singleForm = $('.giftWrapping-single');
            const $multiForm = $('.giftWrapping-multiple');

            if (value === 'same') {
                $singleForm.show();
                $multiForm.hide();
            } else {
                $singleForm.hide();
                $multiForm.show();
            }
        }

        $('[name="giftwraptype"]').click(toggleViews);

        toggleViews();
    }

    bindEvents() {
        this.bindCartEvents();
        this.bindPromoCodeEvents();
        this.bindGiftWrappingEvents();
        this.bindGiftCertificateEvents();
        
        if ($("[content-init]").attr("content-init")=="true") {            
            this.cartCheckSI();            
            $("[content-init]").attr("content-init", false);
        }

        // initiate shipping estimator module
        this.shippingEstimator = new ShippingEstimator($('[data-shipping-estimator]'));
    }
}
